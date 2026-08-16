// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KryptrLaunchTokenTemplate} from "../../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../../src/TokenFactory.sol";
import {FactoryHandler} from "./FactoryHandler.t.sol";

/// @notice Invariant suite (Foundry stateful testing, T21 §4.4 params in
///         foundry.toml). Starting set per doc #60: INV-BOND-1/2/3, INV-SUP-1,
///         INV-INIT-1, INV-FEE-3 ghost. INV-FEE-2/4 + FK-2 venue accrual land
///         with the venue phase (explicit carve-out, wave-5 design doc §2).
contract FactoryInvariantTest is Test {
    uint16 internal constant RATE_BPS = 175;
    uint256 internal constant BOND = 1 ether;

    KryptrLaunchTokenTemplate internal template;
    KryptrTokenFactory internal factory;
    FactoryHandler internal handler;
    address internal sink = makeAddr("bondSink");

    function setUp() public {
        template = new KryptrLaunchTokenTemplate();
        factory = new KryptrTokenFactory(address(template), RATE_BPS, BOND, sink);
        handler = new FactoryHandler(factory);
        // Bound the fuzzer to the handler only.
        targetContract(address(handler));
        // FORK-MODE funding (fork-tests round, run 31949753694): local anvil
        // auto-funds every account, a real RPC funds NOBODY — the invariant
        // sequence sender would start at balance 0 and the whole campaign
        // dies in setup with "lack of funds (0) for max fee". Pin an
        // explicit, funded sender so the campaign runs identically on a
        // real Base fork.
        address fuzzerSender = makeAddr("invariantFuzzerSender");
        vm.deal(fuzzerSender, 1000 ether);
        vm.deal(address(handler), 1000 ether);
        vm.deal(address(this), 1000 ether);
        targetSender(fuzzerSender);
    }

    /// INV-BOND-1 + INV-BOND-2: the ledger equals the ghost sum of bonds paid,
    /// per-deployer accounting reconciles, and every collected bond was
    /// forwarded to the constructor-immutable sink (factory holds 0).
    function invariant_bondLedger_reconcilesWithSink() public view {
        assertEq(factory.totalBondsCollected(), handler.ghostBondsPaid());
        assertEq(factory.totalBondsCollected(), handler.deployCount() * BOND);
        assertEq(sink.balance, handler.ghostBondsPaid());
        assertEq(address(factory).balance, 0);
        assertEq(factory.bondsByDeployer(handler.deployerA()), handler.bondsPaidByA());
        assertEq(factory.bondsByDeployer(handler.deployerB()), handler.bondsPaidByB());
        assertEq(handler.bondsPaidByA() + handler.bondsPaidByB(), handler.ghostBondsPaid());
    }

    function invariant_bondParams_immutable() public view {
        assertEq(factory.bondAmount(), BOND);
        assertEq(factory.bondSink(), sink);
        assertEq(factory.totalFeeBps(), RATE_BPS);
        assertEq(factory.template(), address(template));
    }

    /// INV-SUP-1 + INV-FEE-3 ghost: every deployed clone conserves supply
    /// (Σ balances == totalSupply, minted once to its deployer) and keeps its
    /// frozen schedule summing to RATE — no handler action can alter either.
    function invariant_clones_supplyAndScheduleFrozen() public view {
        address[] memory clones = handler.clones();
        for (uint256 i = 0; i < clones.length; i++) {
            KryptrLaunchTokenTemplate t = KryptrLaunchTokenTemplate(clones[i]);
            uint256 supply = t.totalSupply();
            assertTrue(supply > 0);
            assertEq(t.balanceOf(handler.deployerA()) + t.balanceOf(handler.deployerB()), supply);
            assertEq(
                uint256(t.creatorFeeBps()) + uint256(t.lpFeeBps()) + uint256(t.protocolFeeBps())
                    + uint256(t.buybackFeeBps()),
                RATE_BPS
            );
            // INV-FEE-3 (G1 self-contained): the FULL schedule — all four
            // shares AND all four recipients — must be byte-identical to the
            // deploy-time snapshot. A sum-preserving share swap or recipient
            // substitution cannot pass this hash.
            bytes32 live = keccak256(
                abi.encodePacked(
                    t.creatorFeeBps(),
                    t.lpFeeBps(),
                    t.protocolFeeBps(),
                    t.buybackFeeBps(),
                    t.creatorRecipient(),
                    t.lpRecipient(),
                    t.protocolRecipient(),
                    t.buybackRecipient()
                )
            );
            assertEq(live, handler.ghostScheduleHash(clones[i]), "schedule drifted after deploy");
        }
    }

    /// INV-INIT-1: no clone can ever be re-initialized, at any sequence depth.
    function invariant_clones_neverReinitializable() public {
        address[] memory clones = handler.clones();
        for (uint256 i = 0; i < clones.length; i++) {
            KryptrLaunchTokenTemplate.InitParams memory ip;
            ip.name = "x";
            ip.symbol = "X";
            ip.totalSupply = 1;
            ip.deployer = address(this);
            ip.rateBps = RATE_BPS;
            ip.creatorFeeBps = RATE_BPS;
            ip.creatorRecipient = address(this);
            ip.lpRecipient = address(this);
            ip.protocolRecipient = address(this);
            ip.buybackRecipient = address(this);
            vm.expectRevert(KryptrLaunchTokenTemplate.AlreadyInitialized.selector);
            KryptrLaunchTokenTemplate(clones[i]).initialize(ip);
        }
    }
}
