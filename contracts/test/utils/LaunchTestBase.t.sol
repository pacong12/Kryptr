// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KryptrLaunchTokenTemplate} from "../../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../../src/TokenFactory.sol";

/// @notice Shared fixture for the launch contracts. RATE reference 175 bps is
///         the single numeric source of truth shared with the API gate's
///         LAUNCH_TOTAL_FEE_BPS (wave-5 ruling 2); the parity assertion lives
///         in TokenFactory.t.sol.
abstract contract LaunchTestBase is Test {
    uint16 internal constant RATE_BPS = 175;
    uint256 internal constant BOND = 1 ether;

    KryptrLaunchTokenTemplate internal template;
    KryptrTokenFactory internal factory;
    address internal sink = makeAddr("bondSink");
    address internal deployer = makeAddr("deployer");
    address internal creatorRcpt = makeAddr("creatorRecipient");
    address internal lpRcpt = makeAddr("lpRecipient");
    address internal protocolRcpt = makeAddr("protocolRecipient");
    address internal buybackRcpt = makeAddr("buybackRecipient");

    function setUp() public virtual {
        template = new KryptrLaunchTokenTemplate();
        factory = new KryptrTokenFactory(address(template), RATE_BPS, BOND, sink);
        vm.deal(deployer, 100 ether);
    }

    /// @dev Reference split: 100/40/20/15 == 175 (four integer-bps shares).
    function defaultParams() internal view returns (KryptrTokenFactory.DeployParams memory p) {
        p.name = "Kryptr Test Token";
        p.symbol = "KTT";
        p.totalSupply = 1_000_000;
        p.deployNonce = 0;
        p.creatorFeeBps = 100;
        p.lpFeeBps = 40;
        p.protocolFeeBps = 20;
        p.buybackFeeBps = 15;
        p.creatorRecipient = creatorRcpt;
        p.lpRecipient = lpRcpt;
        p.protocolRecipient = protocolRcpt;
        p.buybackRecipient = buybackRcpt;
    }

    function deployDefault() internal returns (address token) {
        vm.prank(deployer);
        token = factory.deployToken{value: BOND}(defaultParams());
    }

    function initParamsFor(address tokenDeployer, KryptrTokenFactory.DeployParams memory p)
        internal
        view
        returns (KryptrLaunchTokenTemplate.InitParams memory ip)
    {
        ip.name = p.name;
        ip.symbol = p.symbol;
        ip.totalSupply = p.totalSupply;
        ip.deployer = tokenDeployer;
        ip.rateBps = RATE_BPS;
        ip.creatorFeeBps = p.creatorFeeBps;
        ip.lpFeeBps = p.lpFeeBps;
        ip.protocolFeeBps = p.protocolFeeBps;
        ip.buybackFeeBps = p.buybackFeeBps;
        ip.creatorRecipient = p.creatorRecipient;
        ip.lpRecipient = p.lpRecipient;
        ip.protocolRecipient = p.protocolRecipient;
        ip.buybackRecipient = p.buybackRecipient;
    }
}
