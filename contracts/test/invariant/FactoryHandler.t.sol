// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KryptrLaunchTokenTemplate} from "../../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../../src/TokenFactory.sol";

/// @notice Handler for the factory invariant campaign. Only VALID deploys are
///         exercised (invalid-input paths are covered by the unit suite); the
///         handler ghosts mirror everything the invariants reconcile against.
contract FactoryHandler is Test {
    uint256 internal constant BOND = 1 ether;
    uint16 internal constant RATE_BPS = 175;

    KryptrTokenFactory internal immutable factory;

    address public deployerA = makeAddr("handlerDeployerA");
    address public deployerB = makeAddr("handlerDeployerB");

    address[] internal _clones;
    mapping(address => bool) internal _isClone;
    // ghost: fee share recorded at deploy, per clone (INV-FEE-3 ghost)
    mapping(address => uint256) internal _ghostCreatorBps;

    uint256 public deployCount;
    uint256 public ghostBondsPaid;
    uint256 public bondsPaidByA;
    uint256 public bondsPaidByB;

    string[4] internal names = ["Alpha", "Beta", "Gamma", "Delta"];
    string[4] internal symbols = ["ALP", "BET", "GAM", "DEL"];
    address[4] internal recipientPool;

    constructor(KryptrTokenFactory factory_) {
        factory = factory_;
        recipientPool = [makeAddr("rcpt0"), makeAddr("rcpt1"), makeAddr("rcpt2"), makeAddr("rcpt3")];
    }

    function clones() external view returns (address[] memory) {
        return _clones;
    }

    function ghostCreatorBps(address clone) external view returns (uint256) {
        return _ghostCreatorBps[clone];
    }

    /// @dev Deploys a token with a randomized VALID schedule (four integer-bps
    ///      shares summing to RATE) and consent-style params. Fuzzer-driven.
    function deploy(
        uint256 deployerSeed,
        uint256 cut1,
        uint256 cut2,
        uint256 cut3,
        uint256 nameIdx,
        uint256 nonce,
        uint256 supply
    ) external {
        address deployer = deployerSeed % 2 == 0 ? deployerA : deployerB;

        // Random split of 175 into four non-negative integer shares.
        uint16 c1 = uint16(bound(cut1, 0, RATE_BPS));
        uint16 c2 = uint16(bound(cut2, 0, RATE_BPS - c1));
        uint16 c3 = uint16(bound(cut3, 0, RATE_BPS - c1 - c2));

        KryptrTokenFactory.DeployParams memory p;
        p.name = names[nameIdx % 4];
        p.symbol = symbols[nameIdx % 4];
        p.totalSupply = bound(supply, 1, 1_000_000_000_000);
        p.deployNonce = nonce;
        p.creatorFeeBps = c1;
        p.lpFeeBps = c2;
        p.protocolFeeBps = c3;
        p.buybackFeeBps = uint16(RATE_BPS - c1 - c2 - c3);
        p.creatorRecipient = recipientPool[nameIdx % 4];
        p.lpRecipient = recipientPool[(nameIdx + 1) % 4];
        p.protocolRecipient = recipientPool[(nameIdx + 2) % 4];
        p.buybackRecipient = recipientPool[(nameIdx + 3) % 4];

        // Salt collisions (identical consent-frozen params replayed) revert by
        // design — skip them cleanly instead of poisoning the campaign.
        vm.deal(deployer, BOND);
        vm.prank(deployer);
        try factory.deployToken{value: BOND}(p) returns (address token) {
            if (!_isClone[token]) {
                _isClone[token] = true;
                _clones.push(token);
                _ghostCreatorBps[token] = c1;
            }
            deployCount++;
            ghostBondsPaid += BOND;
            if (deployer == deployerA) {
                bondsPaidByA += BOND;
            } else {
                bondsPaidByB += BOND;
            }
        } catch {
            // collision or revert: nothing was paid, nothing was deployed
        }
    }

    /// @dev Moves tokens between the two deployers on a random clone —
    ///      exercises supply conservation (INV-SUP-1) under transfer churn.
    function shuffle(uint256 cloneSeed, uint256 amount, uint256 direction) external {
        if (_clones.length == 0) return;
        KryptrLaunchTokenTemplate t = KryptrLaunchTokenTemplate(_clones[cloneSeed % _clones.length]);
        address from = direction % 2 == 0 ? deployerA : deployerB;
        address to = from == deployerA ? deployerB : deployerA;
        uint256 bal = t.balanceOf(from);
        if (bal == 0) return;
        uint256 x = bound(amount, 1, bal);
        vm.prank(from);
        t.transfer(to, x);
    }
}
