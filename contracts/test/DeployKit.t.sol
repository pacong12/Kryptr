// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployKitLib} from "../script/DeployKitLib.sol";
import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";
import {KryptrTokenFactory} from "../src/TokenFactory.sol";

/// @notice Deploy-kit proof (wave-5 closing): the EXACT calldata the kit emits
///         must deploy, and the deployed factory must read back the frozen
///         constructor parameters. This makes "kit output == deployable reality"
///         a tested fact before wave 6 ever touches a live chain.
contract DeployKitTest is Test {
    address internal sink = makeAddr("bondSinkPlaceholder");

    function _create(bytes memory creationData) internal returns (address deployed) {
        assembly {
            deployed := create(0, add(creationData, 0x20), mload(creationData))
        }
        assertTrue(deployed != address(0), "kit calldata failed to deploy");
    }

    /// tx1: template creation data deploys; the implementation is born-initialized
    /// (constructor guard), matching what the live template must look like.
    function test_kitTemplateData_deploysBornInitialized() public {
        address impl = _create(DeployKitLib.templateDeployData());
        assertTrue(impl.code.length > 0, "template has no runtime code");
        KryptrLaunchTokenTemplate.InitParams memory ip;
        ip.name = "x";
        ip.symbol = "X";
        ip.totalSupply = 1;
        ip.deployer = address(this);
        ip.rateBps = 175;
        ip.creatorFeeBps = 175;
        ip.creatorRecipient = address(this);
        ip.lpRecipient = address(this);
        ip.protocolRecipient = address(this);
        ip.buybackRecipient = address(this);
        vm.expectRevert(KryptrLaunchTokenTemplate.AlreadyInitialized.selector);
        KryptrLaunchTokenTemplate(impl).initialize(ip);
    }

    /// tx2: factory creation data with frozen args deploys, and every immutable
    /// reads back exactly the frozen wave-5 parameters.
    function test_kitFactoryData_deploysWithFrozenArgs() public {
        address impl = _create(DeployKitLib.templateDeployData());
        KryptrTokenFactory factory =
            KryptrTokenFactory(payable(_create(DeployKitLib.factoryDeployData(impl, sink))));
        assertEq(factory.template(), impl, "template arg mismatch");
        assertEq(uint256(factory.totalFeeBps()), 175, "RATE not frozen at 175");
        assertEq(factory.bondAmount(), 0.01 ether, "bondAmount not frozen at 0.01 ETH");
        assertEq(factory.bondSink(), sink, "bondSink arg mismatch");
        assertEq(uint256(factory.FACTORY_VERSION()), 1, "FACTORY_VERSION drift");
    }

    /// Fail-closed kit surface: zero addresses are rejected BEFORE any calldata
    /// exists — the kit can never emit a factory deploy with a zero sink.
    function test_kitFactoryData_zeroInputsRevert() public {
        address impl = _create(DeployKitLib.templateDeployData());
        vm.expectRevert(bytes("kit: bondSink zero (fail-closed)"));
        this._factoryDataExt(impl, address(0));
        vm.expectRevert(bytes("kit: template address zero"));
        this._factoryDataExt(address(0), sink);
    }

    /// @dev External seam so vm.expectRevert can observe the library revert
    ///      (internal calls inline and propagate past the cheatcode).
    function _factoryDataExt(address t, address s) external pure returns (bytes memory) {
        return DeployKitLib.factoryDeployData(t, s);
    }

    /// Determinism: identical inputs => byte-identical calldata (the operator
    /// can diff kit runs across machines/times; any drift = NO-GO).
    function test_kitData_isDeterministic() public {
        assertEq(
            keccak256(DeployKitLib.templateDeployData()),
            keccak256(DeployKitLib.templateDeployData())
        );
        address impl = makeAddr("templatePlaceholder");
        assertEq(
            keccak256(DeployKitLib.factoryDeployData(impl, sink)),
            keccak256(DeployKitLib.factoryDeployData(impl, sink))
        );
    }
}
