// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {LaunchTestBase} from "./utils/LaunchTestBase.t.sol";
import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../src/TokenFactory.sol";

/// @notice Factory unit tests: deploy flow, bond accounting (INV-BOND-1/2/3),
///         schedule validation (INV-FEE-1), determinism (FK-1), clone shape
///         (G4 P-1), clone isolation (INV-CLONE-1), RATE parity (ruling 2).
contract TokenFactoryTest is LaunchTestBase {
    // ------------------------------------------------------ RATE parity gate

    /// Ruling 2: RATE is factory-frozen at the reference 175. This constant is
    /// the on-chain mirror of the API gate's LAUNCH_TOTAL_FEE_BPS (#68) — one
    /// numeric source of truth; drift here means the factory and the gate
    /// disagree about what a valid launch fee is.
    function test_rateAnchor_is175() public view {
        assertEq(factory.totalFeeBps(), RATE_BPS);
        assertEq(factory.totalFeeBps(), 175);
    }

    function test_constructorParams_frozen() public view {
        assertEq(factory.template(), address(template));
        assertEq(factory.bondAmount(), BOND);
        assertEq(factory.bondSink(), sink);
        assertEq(factory.FACTORY_VERSION(), 1);
    }

    function test_constructor_rejectsBadParams() public {
        vm.expectRevert(KryptrTokenFactory.TemplateInvalid.selector);
        new KryptrTokenFactory(address(0), RATE_BPS, BOND, sink);

        vm.expectRevert(KryptrTokenFactory.RateInvalid.selector);
        new KryptrTokenFactory(address(template), 0, BOND, sink);

        vm.expectRevert(KryptrTokenFactory.RateInvalid.selector);
        new KryptrTokenFactory(address(template), 10_001, BOND, sink);

        vm.expectRevert(KryptrTokenFactory.BondAmountZero.selector);
        new KryptrTokenFactory(address(template), RATE_BPS, 0, sink);

        vm.expectRevert(KryptrTokenFactory.SinkZero.selector);
        new KryptrTokenFactory(address(template), RATE_BPS, BOND, address(0));
    }

    // -------------------------------------------------------------- INV-FEE-1

    function test_deploy_rejectsScheduleSumMismatch_low() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.buybackFeeBps = 14; // 174
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.ScheduleSumInvalid.selector);
        factory.deployToken{value: BOND}(p);
    }

    function test_deploy_rejectsScheduleSumMismatch_high() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.buybackFeeBps = 16; // 176
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.ScheduleSumInvalid.selector);
        factory.deployToken{value: BOND}(p);
    }

    function test_deploy_rejectsZeroRecipient() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.protocolRecipient = address(0);
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.RecipientZero.selector);
        factory.deployToken{value: BOND}(p);
    }

    function test_deploy_rejectsBadMetadata() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.name = "";
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.TokenNameInvalid.selector);
        factory.deployToken{value: BOND}(p);

        p = defaultParams();
        p.symbol = new string(13);
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.TokenSymbolInvalid.selector);
        factory.deployToken{value: BOND}(p);

        p = defaultParams();
        p.totalSupply = 0;
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.SupplyZero.selector);
        factory.deployToken{value: BOND}(p);
    }

    // -------------------------------------------------------------- INV-BOND-1

    function test_deploy_rejectsWrongBondValue() public {
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.BondMismatch.selector);
        factory.deployToken{value: BOND - 1}(defaultParams());

        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.BondMismatch.selector);
        factory.deployToken{value: BOND + 1}(defaultParams());
    }

    /// A failed deploy changes NOTHING: ledger, sink balance, deployer balance
    /// all untouched (atomicity; INV-BOND-1 revert half).
    function test_failedDeploy_changesNothing() public {
        uint256 sinkBefore = sink.balance;
        uint256 deployerBefore = deployer.balance;
        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.BondMismatch.selector);
        factory.deployToken{value: BOND / 2}(defaultParams());
        assertEq(factory.totalBondsCollected(), 0);
        assertEq(factory.bondsByDeployer(deployer), 0);
        assertEq(sink.balance, sinkBefore);
        assertEq(deployer.balance, deployerBefore);
    }

    /// A consumed salt can never deploy (and thus pay) again — CREATE2
    /// collision reverts (INV-BOND-1: a salt cannot pay twice).
    function test_duplicateSalt_revertsAndLedgerUnchanged() public {
        deployDefault();
        assertEq(factory.totalBondsCollected(), BOND);

        vm.prank(deployer);
        vm.expectRevert(KryptrTokenFactory.CloneCreationFailed.selector);
        factory.deployToken{value: BOND}(defaultParams());

        assertEq(factory.totalBondsCollected(), BOND); // unchanged after revert
        assertEq(factory.bondsByDeployer(deployer), BOND);
    }

    /// Distinct deployers with identical token params never collide (salt
    /// includes the deployer) — each pays the bond exactly once.
    function test_sameParamsDifferentDeployers_bothDeploy() public {
        address other = makeAddr("otherDeployer");
        vm.deal(other, 10 ether);

        deployDefault();
        vm.prank(other);
        address t2 = factory.deployToken{value: BOND}(defaultParams());

        assertEq(factory.totalBondsCollected(), 2 * BOND);
        assertEq(factory.bondsByDeployer(deployer), BOND);
        assertEq(factory.bondsByDeployer(other), BOND);
        assertTrue(t2 != address(0));
    }

    /// deployNonce enables deliberate deterministic relaunch of identical
    /// params (consent-frozen, never random).
    function test_deployNonce_allowsRelaunch() public {
        deployDefault();
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.deployNonce = 1;
        vm.prank(deployer);
        address t2 = factory.deployToken{value: BOND}(p);
        assertTrue(t2 != address(0));
        assertEq(factory.totalBondsCollected(), 2 * BOND);
    }

    // -------------------------------------------------------------- INV-BOND-2

    /// Immediate forwarding: factory holds 0 ETH between deploys; the only
    /// sink is the constructor-immutable bondSink.
    function test_bond_forwardedToSinkOnly() public {
        deployDefault();
        assertEq(sink.balance, BOND);
        assertEq(address(factory).balance, 0);
        assertEq(factory.totalBondsCollected(), BOND);

        deployDefault2();
        assertEq(sink.balance, 2 * BOND);
        assertEq(address(factory).balance, 0);
    }

    // -------------------------------------------------------------- INV-BOND-3

    /// Bond parameters never change across deploys (immutable by construction;
    /// any change would be a build defect — asserted, not just assumed).
    function test_bondParam_immutableAcrossDeploys() public {
        uint256 bondBefore = factory.bondAmount();
        address sinkBefore = factory.bondSink();
        deployDefault();
        deployDefault2();
        assertEq(factory.bondAmount(), bondBefore);
        assertEq(factory.bondSink(), sinkBefore);
    }

    // ------------------------------------------------------------- determinism

    /// FK-1 circularity breaker: prediction must equal the ACTUAL deployed
    /// address (the contract never self-attests alone — the battery asserts
    /// equality against the real CREATE2 outcome).
    function test_predictTokenAddress_matchesDeployed() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        address predicted = factory.predictTokenAddress(deployer, p);
        vm.prank(deployer);
        address actual = factory.deployToken{value: BOND}(p);
        assertEq(actual, predicted);
    }

    function test_deploySalt_isDeterministic() public view {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        assertEq(factory.deploySalt(deployer, p), factory.deploySalt(deployer, p));
        p.deployNonce = 7;
        assertTrue(factory.deploySalt(deployer, p) != factory.deploySalt(deployer, defaultParams()));
    }

    /// The deploy event carries the ground truth for the launch audit trail.
    function test_deploy_emitsTokenDeployed() public {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        bytes32 salt = factory.deploySalt(deployer, p);
        vm.expectEmit(true, true, true, true);
        emit KryptrTokenFactory.TokenDeployed(
            deployer,
            factory.predictTokenAddress(deployer, p),
            salt,
            BOND,
            p.creatorFeeBps,
            p.lpFeeBps,
            p.protocolFeeBps,
            p.buybackFeeBps,
            p.creatorRecipient,
            p.lpRecipient,
            p.protocolRecipient,
            p.buybackRecipient
        );
        vm.prank(deployer);
        factory.deployToken{value: BOND}(p);
    }

    // ------------------------------------------------------------ G4 P-1 shape

    /// Clone runtime is exactly the 45-byte EIP-1167 forwarding stub with the
    /// template address at bytes 10..29.
    function test_cloneRuntime_isEip1167() public {
        address token = deployDefault();
        bytes memory code = token.code;
        assertEq(code.length, 45);
        // prefix: 363d3d373d3d3d363d73
        bytes10 prefix = 0x363d3d373d3d3d363d73;
        for (uint256 i = 0; i < 10; i++) {
            assertEq(code[i], prefix[i]);
        }
        // impl address at bytes 10..29
        for (uint256 i = 0; i < 20; i++) {
            assertEq(code[10 + i], bytes20(uint160(address(template)))[i]);
        }
        // suffix: 5af43d82803e903d91602b57fd5bf3
        bytes15 suffix = 0x5af43d82803e903d91602b57fd5bf3;
        for (uint256 i = 0; i < 15; i++) {
            assertEq(code[30 + i], suffix[i]);
        }
    }

    // ---------------------------------------------------------- INV-CLONE-1

    /// Storage isolation: actions on clone A never touch clone B or the
    /// template implementation (storage stomping is THE EIP-1167 bug class).
    function test_cloneIsolation() public {
        address a = deployDefault();
        KryptrTokenFactory.DeployParams memory p2 = defaultParams();
        p2.name = "Second Token";
        p2.symbol = "SEC";
        vm.prank(deployer);
        address b = factory.deployToken{value: BOND}(p2);

        uint256 supply = KryptrLaunchTokenTemplate(a).totalSupply();
        vm.prank(deployer);
        KryptrLaunchTokenTemplate(a).transfer(makeAddr("alice"), supply / 4);

        // B untouched
        assertEq(KryptrLaunchTokenTemplate(b).balanceOf(deployer), supply);
        // template implementation untouched (and born-initialized)
        assertEq(template.totalSupply(), 0);
        assertEq(template.balanceOf(deployer), 0);
        // metadata isolation
        assertEq(KryptrLaunchTokenTemplate(a).symbol(), "KTT");
        assertEq(KryptrLaunchTokenTemplate(b).symbol(), "SEC");
    }

    /// INV-SUP-1 on the deployed clone: supply minted once to the deployer;
    /// Σ balances == totalSupply.
    function test_clone_supplyConservation() public {
        address token = deployDefault();
        KryptrLaunchTokenTemplate t = KryptrLaunchTokenTemplate(token);
        assertEq(t.totalSupply(), 1_000_000 * 10 ** 18);
        assertEq(t.balanceOf(deployer), t.totalSupply());
        address alice = makeAddr("alice");
        vm.prank(deployer);
        t.transfer(alice, 100 * 10 ** 18);
        assertEq(t.balanceOf(deployer) + t.balanceOf(alice), t.totalSupply());
    }

    // ---------------------------------------------------------------- helpers

    function deployDefault2() internal returns (address token) {
        KryptrTokenFactory.DeployParams memory p = defaultParams();
        p.deployNonce = 999; // distinct salt, same deployer
        vm.prank(deployer);
        token = factory.deployToken{value: BOND}(p);
    }
}
