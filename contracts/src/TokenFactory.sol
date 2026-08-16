// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {KryptrLaunchTokenTemplate} from "./TokenTemplate.sol";

/// @title KryptrTokenFactory
/// @notice Deploys immutable EIP-1167 clone launch tokens (decision doc Option A).
///         Constructor-immutable parameters (template, RATE total, bond amount,
///         bond sink) — no admin surface, no setters, no upgrade path (T20).
///
///         Rulings (launchpad memo §3; wave-5 design doc §8):
///         - RATE total is frozen here (reference 175 bps); DISTRIBUTION (four
///           integer-bps shares, Σ == RATE) is per-launch (doc #60 §4.2).
///         - Bond parameter lives on-chain here; the gate validates bond-paid as
///           a deploy-intent precondition (split ownership, ruling 2).
///         - bondSink is a constructor-immutable with immediate forwarding: the
///           factory holds 0 ETH between deploys (INV-BOND-2 trivially holds;
///           changing the sink = new factory release = full T21 re-verification).
///
///         INV mapping (wave5-t21-verification-design.md):
///         - INV-BOND-1: each successful deploy pays EXACTLY bondAmount; reverts
///           change nothing; CREATE2 salt collisions make double-payment
///           structurally impossible.
///         - INV-BOND-2: authorized sink set == {bondSink}; immediate forwarding.
///         - INV-BOND-3: bond parameters immutable by construction.
///         - INV-FEE-1:  schedule validated at deploy (Σ shares == RATE total).
///         - INV-INIT-1: clone initialized exactly once, same tx as creation.
contract KryptrTokenFactory {
    // ---------------------------------------------------------------- events

    event TokenDeployed(
        address indexed deployer,
        address indexed token,
        bytes32 indexed salt,
        uint256 bond,
        uint16 creatorFeeBps,
        uint16 lpFeeBps,
        uint16 protocolFeeBps,
        uint16 buybackFeeBps,
        address creatorRecipient,
        address lpRecipient,
        address protocolRecipient,
        address buybackRecipient
    );

    // ---------------------------------------------------------------- errors

    error BondMismatch();
    error ScheduleSumInvalid();
    error RecipientZero();
    error TokenNameInvalid();
    error TokenSymbolInvalid();
    error SupplyZero();
    error TemplateInvalid();
    error RateInvalid();
    error BondAmountZero();
    error SinkZero();
    error CloneCreationFailed();
    error SinkTransferFailed();

    // ---------------------------------------------------------------- state

    /// @notice Bumped on every factory release; part of the CREATE2 salt so a
    ///         new release can never collide with a previous one.
    uint8 public constant FACTORY_VERSION = 1;

    address public immutable template;
    /// @notice RATE space anchor (doc #60 §4.2): the launch TOTAL fee bps,
    ///         frozen at deploy of the factory. Reference value 175.
    uint16 public immutable totalFeeBps;
    uint256 public immutable bondAmount;
    address public immutable bondSink;

    /// @notice Bond ledger (INV-BOND-1/2 audit ground truth).
    uint256 public totalBondsCollected;
    mapping(address => uint256) public bondsByDeployer;

    struct DeployParams {
        string name; // 1..64 bytes
        string symbol; // 1..12 bytes
        uint256 totalSupply; // integer token units, > 0
        uint256 deployNonce; // consent-frozen, deterministic relaunch control
        uint16 creatorFeeBps;
        uint16 lpFeeBps;
        uint16 protocolFeeBps;
        uint16 buybackFeeBps;
        address creatorRecipient;
        address lpRecipient;
        address protocolRecipient;
        address buybackRecipient;
    }

    constructor(address template_, uint16 totalFeeBps_, uint256 bondAmount_, address bondSink_) {
        if (template_.code.length == 0) revert TemplateInvalid();
        if (totalFeeBps_ == 0 || totalFeeBps_ > 10_000) revert RateInvalid();
        if (bondAmount_ == 0) revert BondAmountZero();
        if (bondSink_ == address(0)) revert SinkZero();
        template = template_;
        totalFeeBps = totalFeeBps_;
        bondAmount = bondAmount_;
        bondSink = bondSink_;
    }

    // ------------------------------------------------------------- salt/addr

    /// @notice Deterministic CREATE2 salt (ops memo §2.2 pt 3): derived from
    ///         deployer + consent-frozen token params + version, never random.
    ///         Consent freezes ALL salt inputs (incl. nonce) so HITL approves
    ///         the exact deterministic address.
    function deploySalt(address deployer, DeployParams calldata p) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                deployer,
                keccak256(bytes(p.name)),
                keccak256(bytes(p.symbol)),
                p.totalSupply,
                p.deployNonce,
                FACTORY_VERSION
            )
        );
    }

    /// @notice Predicts the clone address for a consent-frozen parameter set
    ///         (on-chain oracle for the gate/UI salt re-derivation).
    function predictTokenAddress(address deployer, DeployParams calldata p)
        public
        view
        returns (address)
    {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            deploySalt(deployer, p),
                            _creationCodeHash(template)
                        )
                    )
                )
            )
        );
    }

    // ---------------------------------------------------------------- deploy

    /// @notice Deploys a launch token clone. The caller pays the bond exactly.
    ///         Effects (bond ledger) precede interactions (clone init, sink
    ///         forwarding) — checks-effects-interactions throughout.
    function deployToken(DeployParams calldata p) external payable returns (address token) {
        if (msg.value != bondAmount) revert BondMismatch();

        // INV-FEE-1 mirror of the gate's validation (integer bps, Σ == RATE).
        if (
            uint256(p.creatorFeeBps) + uint256(p.lpFeeBps) + uint256(p.protocolFeeBps)
                    + uint256(p.buybackFeeBps) != uint256(totalFeeBps)
        ) revert ScheduleSumInvalid();
        if (
            p.creatorRecipient == address(0) || p.lpRecipient == address(0)
                || p.protocolRecipient == address(0) || p.buybackRecipient == address(0)
        ) revert RecipientZero();
        if (bytes(p.name).length == 0 || bytes(p.name).length > 64) revert TokenNameInvalid();
        if (bytes(p.symbol).length == 0 || bytes(p.symbol).length > 12) {
            revert TokenSymbolInvalid();
        }
        if (p.totalSupply == 0) revert SupplyZero();

        // Effects: bond ledger first (a later revert undoes all of this atomically).
        totalBondsCollected += bondAmount;
        bondsByDeployer[msg.sender] += bondAmount;

        // Interactions: create + initialize the clone in this transaction.
        // A consumed salt can never deploy (or pay) again — CREATE2 reverts on
        // collision (INV-BOND-1: a salt cannot pay twice).
        bytes32 salt = deploySalt(msg.sender, p);
        token = _cloneDeterministic(template, salt);
        KryptrLaunchTokenTemplate(token)
            .initialize(
                KryptrLaunchTokenTemplate.InitParams({
                name: p.name,
                symbol: p.symbol,
                totalSupply: p.totalSupply,
                deployer: msg.sender,
                rateBps: totalFeeBps,
                creatorFeeBps: p.creatorFeeBps,
                lpFeeBps: p.lpFeeBps,
                protocolFeeBps: p.protocolFeeBps,
                buybackFeeBps: p.buybackFeeBps,
                creatorRecipient: p.creatorRecipient,
                lpRecipient: p.lpRecipient,
                protocolRecipient: p.protocolRecipient,
                buybackRecipient: p.buybackRecipient
            })
            );

        // INV-BOND-2: the only sink is the constructor-immutable bondSink.
        // Immediate forwarding keeps the factory balance at 0 between deploys.
        (bool ok,) = bondSink.call{value: bondAmount}("");
        if (!ok) revert SinkTransferFailed();

        emit TokenDeployed(
            msg.sender,
            token,
            salt,
            bondAmount,
            p.creatorFeeBps,
            p.lpFeeBps,
            p.protocolFeeBps,
            p.buybackFeeBps,
            p.creatorRecipient,
            p.lpRecipient,
            p.protocolRecipient,
            p.buybackRecipient
        );
    }

    // ------------------------------------------------------- EIP-1167 helpers
    // Standard minimal-proxy creation code (F1): 55-byte creation prefix whose
    // 45-byte runtime delegate-calls `impl`; impl address sits at runtime bytes
    // 10..29 (T21 G4 P-1 asserts this shape on every clone).

    function _cloneDeterministic(address impl, bytes32 salt) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(96, impl))
            mstore(
                add(ptr, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )
            instance := create2(0, ptr, 0x37, salt)
        }
        if (instance == address(0)) revert CloneCreationFailed();
    }

    function _creationCodeHash(address impl) internal pure returns (bytes32 h) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(96, impl))
            mstore(
                add(ptr, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )
            h := keccak256(ptr, 0x37)
        }
    }
}
