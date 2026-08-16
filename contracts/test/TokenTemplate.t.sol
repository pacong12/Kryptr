// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LaunchTestBase} from "./utils/LaunchTestBase.t.sol";
import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";

/// @notice Template unit tests. INV mapping in test names where applicable.
contract TokenTemplateTest is LaunchTestBase {
    KryptrLaunchTokenTemplate internal clone;

    function setUp() public override {
        super.setUp();
        clone = KryptrLaunchTokenTemplate(deployDefault());
    }

    // ------------------------------------------------------------- INV-INIT-1

    /// The implementation marks itself initialized in its constructor, so the
    /// template's own storage can never be initialized.
    function test_templateImplementation_cannotBeInitialized() public {
        vm.expectRevert(KryptrLaunchTokenTemplate.AlreadyInitialized.selector);
        template.initialize(initParamsFor(deployer, defaultParams()));
    }

    /// INV-INIT-1: a clone initializes exactly once (done by the factory at
    /// deploy); any re-initialization reverts.
    function test_clone_reinitializationReverts() public {
        vm.expectRevert(KryptrLaunchTokenTemplate.AlreadyInitialized.selector);
        clone.initialize(initParamsFor(deployer, defaultParams()));
    }

    // ----------------------------------------------------- metadata & supply

    function test_clone_metadataFrozenAtInit() public view {
        assertEq(clone.name(), "Kryptr Test Token");
        assertEq(clone.symbol(), "KTT");
        assertEq(clone.decimals(), 18);
        assertEq(clone.totalSupply(), 1_000_000 * 10 ** 18);
        assertEq(clone.balanceOf(deployer), 1_000_000 * 10 ** 18);
    }

    function test_init_rejectsEmptyName() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.name = "";
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitNameInvalid.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    function test_init_rejectsOversizedName() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.name = new string(65);
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitNameInvalid.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    function test_init_rejectsBadSymbol() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.symbol = new string(13);
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitSymbolInvalid.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    function test_init_rejectsZeroSupply() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.totalSupply = 0;
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitSupplyZero.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    function test_init_rejectsZeroDeployer() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.deployer = address(0);
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitDeployerZero.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    /// Supply boundary parity with the gate (wave-5 follow-up): the largest
    /// raw supply whose scaled value fits uint256 deploys; one above reverts
    /// fail-closed (checked arithmetic). Gate cap must be tightened to this
    /// floor post-fix.
    function test_init_supplyBoundary() public {
        uint256 maxRaw = type(uint256).max / 10 ** 18;
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.totalSupply = maxRaw;
        // Template implementation itself is born-initialized; use a fresh clone.
        address c = _freshClone();
        KryptrLaunchTokenTemplate(c).initialize(ip);
        assertEq(KryptrLaunchTokenTemplate(c).totalSupply(), maxRaw * 10 ** 18);
    }

    function test_init_supplyAboveBoundaryReverts() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.totalSupply = type(uint256).max / 10 ** 18 + 1;
        address c = _freshClone();
        vm.expectRevert(); // arithmetic overflow panic (0x11)
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    // -------------------------------------------------------------- INV-FEE-1

    function test_init_rejectsScheduleSumMismatch() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.buybackFeeBps = 14; // sum 174 != rate 175
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitFeeScheduleInvalid.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    function test_init_rejectsZeroRecipient() public {
        KryptrLaunchTokenTemplate.InitParams memory ip = initParamsFor(deployer, defaultParams());
        ip.lpRecipient = address(0);
        address c = _freshClone();
        vm.expectRevert(KryptrLaunchTokenTemplate.InitRecipientZero.selector);
        KryptrLaunchTokenTemplate(c).initialize(ip);
    }

    /// INV-FEE-3 (storage view): the clone stores exactly the four
    /// DISTRIBUTION shares and four recipients; RATE is NOT stored.
    function test_clone_scheduleStoredOnce() public view {
        assertEq(clone.creatorFeeBps(), 100);
        assertEq(clone.lpFeeBps(), 40);
        assertEq(clone.protocolFeeBps(), 20);
        assertEq(clone.buybackFeeBps(), 15);
        assertEq(
            uint256(clone.creatorFeeBps()) + clone.lpFeeBps() + clone.protocolFeeBps()
                + clone.buybackFeeBps(),
            RATE_BPS
        );
        assertEq(clone.creatorRecipient(), creatorRcpt);
        assertEq(clone.lpRecipient(), lpRcpt);
        assertEq(clone.protocolRecipient(), protocolRcpt);
        assertEq(clone.buybackRecipient(), buybackRcpt);
    }

    // -------------------------------------------------------------- INV-SUP-1

    /// Fee-free conservation: transfer(x) moves EXACTLY x, nothing diverted
    /// (Web3Intel condition on the venue-phase carve-out).
    function test_transfer_movesExactlyX() public {
        address alice = makeAddr("alice");
        uint256 x = 12345 * 10 ** 18;
        vm.prank(deployer);
        clone.transfer(alice, x);
        assertEq(clone.balanceOf(alice), x);
        assertEq(clone.balanceOf(deployer), 1_000_000 * 10 ** 18 - x);
        assertEq(clone.totalSupply(), 1_000_000 * 10 ** 18); // supply conserved
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        address alice = makeAddr("alice");
        vm.prank(alice);
        vm.expectRevert();
        clone.transfer(deployer, 1);
    }

    function test_transfer_revertsToZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(KryptrLaunchTokenTemplate.ZeroAddress.selector);
        clone.transfer(address(0), 1);
    }

    function test_approve_transferFrom_allowanceAccounting() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        uint256 x = 500 * 10 ** 18;
        vm.prank(deployer);
        clone.approve(alice, x);
        assertEq(clone.allowance(deployer, alice), x);
        vm.prank(alice);
        clone.transferFrom(deployer, bob, x);
        assertEq(clone.balanceOf(bob), x);
        assertEq(clone.allowance(deployer, alice), 0);
    }

    function test_transferFrom_infiniteAllowanceNotDecremented() public {
        address alice = makeAddr("alice");
        vm.prank(deployer);
        clone.approve(alice, type(uint256).max);
        vm.prank(alice);
        clone.transferFrom(deployer, alice, 10 ** 18);
        assertEq(clone.allowance(deployer, alice), type(uint256).max);
    }

    function test_transferFrom_revertsOverAllowance() public {
        address alice = makeAddr("alice");
        vm.prank(deployer);
        clone.approve(alice, 10);
        vm.prank(alice);
        vm.expectRevert();
        clone.transferFrom(deployer, alice, 11);
    }

    // ---------------------------------------------------------------- helpers

    /// @dev Deploys a bare (uninitialized) clone via a throwaway factory so
    ///      initialize() edge cases can be exercised directly.
    function _freshClone() internal returns (address c) {
        KryptrTokenFactoryLocal f = new KryptrTokenFactoryLocal(address(template));
        c = f.makeClone(bytes32(uint256(uint160(address(this))) ^ block.number));
    }
}

/// @dev Minimal CREATE2 clone maker for direct-initialization tests. Reuses the
///      factory's EIP-1167 creation code shape (tested separately in
///      TokenFactory.t.sol).
contract KryptrTokenFactoryLocal {
    address internal immutable impl;

    constructor(address impl_) {
        impl = impl_;
    }

    function makeClone(bytes32 salt) external returns (address instance) {
        address i = impl;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(96, i))
            mstore(
                add(ptr, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )
            instance := create2(0, ptr, 0x37, salt)
        }
        require(instance != address(0), "clone failed");
    }
}
