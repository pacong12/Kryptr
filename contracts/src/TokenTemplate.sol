// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title KryptrLaunchTokenTemplate
/// @notice Implementation contract for EIP-1167 minimal-proxy launch tokens.
///         Cloned by KryptrTokenFactory; each clone is initialized exactly once,
///         in the same transaction as its creation. No setters, no admin surface,
///         no mint/burn after initialization, fee-free transfers (the frozen fee
///         schedule is stored as the source of truth for venue-phase collection —
///         venue accrual is a separate, later layer; see the wave-5 design doc).
///
///         INV mapping (wave5-t21-verification-design.md):
///         - INV-INIT-1: exactly-once initialization, constructor-guarded.
///         - INV-FEE-1:  schedule validated at init (sum == rateBps anchor).
///         - INV-FEE-3:  schedule written once; no selector can change it.
///         - INV-SUP-1:  supply minted once in initialize(); no mint/burn paths.
contract KryptrLaunchTokenTemplate {
    // ---------------------------------------------------------------- events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event TokenInitialized(
        address indexed deployer, string name, string symbol, uint256 totalSupplyScaled
    );

    // ---------------------------------------------------------------- errors

    error AlreadyInitialized();
    error InitNameInvalid();
    error InitSymbolInvalid();
    error InitSupplyZero();
    error InitDeployerZero();
    error InitFeeScheduleInvalid();
    error InitRecipientZero();
    error ZeroAddress();

    // ---------------------------------------------------------------- state

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Frozen DISTRIBUTION space (doc #60 §4.2): four integer-bps shares.
    ///         RATE is deliberately NOT stored here — it is validated in
    ///         initialize() against the factory-supplied anchor and lives only
    ///         in the factory's constructor-immutable (single source of truth).
    uint16 public creatorFeeBps;
    uint16 public lpFeeBps;
    uint16 public protocolFeeBps;
    uint16 public buybackFeeBps;
    address public creatorRecipient;
    address public lpRecipient;
    address public protocolRecipient;
    address public buybackRecipient;

    /// @dev Exactly-once guard (INV-INIT-1). The implementation marks ITSELF
    ///      initialized in its constructor so the template's own storage can
    ///      never be initialized; clones copy only the runtime bytecode, so
    ///      every clone starts fresh and initializes exactly once.
    bool private _initialized;

    constructor() {
        _initialized = true;
    }

    // ------------------------------------------------------------ initialize

    struct InitParams {
        string name; // 1..64 bytes
        string symbol; // 1..12 bytes
        uint256 totalSupply; // integer token units (pre-decimals), > 0
        address deployer; // receives the entire initial supply
        uint16 rateBps; // RATE anchor from the factory (validated, not stored)
        uint16 creatorFeeBps;
        uint16 lpFeeBps;
        uint16 protocolFeeBps;
        uint16 buybackFeeBps;
        address creatorRecipient;
        address lpRecipient;
        address protocolRecipient;
        address buybackRecipient;
    }

    /// @notice One-shot initialization. Callable exactly once per clone, by the
    ///         factory, in the same transaction as clone creation. Revalidates
    ///         every parameter (defense in depth: the template trusts no caller).
    function initialize(InitParams calldata p) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        if (bytes(p.name).length == 0 || bytes(p.name).length > 64) revert InitNameInvalid();
        if (bytes(p.symbol).length == 0 || bytes(p.symbol).length > 12) {
            revert InitSymbolInvalid();
        }
        if (p.totalSupply == 0) revert InitSupplyZero();
        if (p.deployer == address(0)) revert InitDeployerZero();
        if (
            uint256(p.creatorFeeBps) + uint256(p.lpFeeBps) + uint256(p.protocolFeeBps)
                    + uint256(p.buybackFeeBps) != uint256(p.rateBps)
        ) revert InitFeeScheduleInvalid();
        if (
            p.creatorRecipient == address(0) || p.lpRecipient == address(0)
                || p.protocolRecipient == address(0) || p.buybackRecipient == address(0)
        ) revert InitRecipientZero();

        name = p.name;
        symbol = p.symbol;
        creatorFeeBps = p.creatorFeeBps;
        lpFeeBps = p.lpFeeBps;
        protocolFeeBps = p.protocolFeeBps;
        buybackFeeBps = p.buybackFeeBps;
        creatorRecipient = p.creatorRecipient;
        lpRecipient = p.lpRecipient;
        protocolRecipient = p.protocolRecipient;
        buybackRecipient = p.buybackRecipient;

        // Checked arithmetic (solc 0.8): raw supplies above floor((2^256-1)/10^18)
        // revert here — fail-closed. The gate's supply cap must match this bound
        // (flagged follow-up: tighten gate cap from uint256-max to this floor).
        uint256 supplyScaled = p.totalSupply * 10 ** uint256(decimals);
        totalSupply = supplyScaled;
        balanceOf[p.deployer] = supplyScaled;

        emit Transfer(address(0), p.deployer, supplyScaled);
        emit TokenInitialized(p.deployer, p.name, p.symbol, supplyScaled);
    }

    // ----------------------------------------------------------- ERC-20 core
    // Fee-free transfers by design: transfer(x) moves exactly x (fee-taking is
    // venue-phase scope; nothing is diverted here — asserted in tests).

    function transfer(address to, uint256 value) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        balanceOf[msg.sender] -= value; // checked: reverts on insufficient balance
        balanceOf[to] += value; // checked: immutable clones favor safety over gas
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value; // checked
        }
        balanceOf[from] -= value; // checked
        balanceOf[to] += value; // checked
        emit Transfer(from, to, value);
        return true;
    }
}
