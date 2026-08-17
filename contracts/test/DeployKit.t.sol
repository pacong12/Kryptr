// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeployKitLib} from "../script/DeployKitLib.sol";
import {DeployKit} from "../script/DeployKit.s.sol";
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

    // ------------------------------------------------- S2 §4: round-trip decode

    /// Round-trip decode (S2 §4 item 1): the values parsed back from the exact
    /// creation bytes equal the operator inputs — the rendered summary IS the
    /// bytes being sent, by construction.
    function test_kitDecode_roundTripMatchesInputs() public {
        address impl = makeAddr("templatePlaceholder");
        bytes memory data = DeployKitLib.factoryDeployData(impl, sink);
        DeployKitLib.FactoryArgs memory decoded = DeployKitLib.decodeFactoryArgs(data);
        assertEq(decoded.template, impl, "decoded template != input");
        assertEq(uint256(decoded.totalFeeBps), 175, "decoded RATE != frozen 175");
        assertEq(decoded.bondAmount, 0.01 ether, "decoded bondAmount != frozen 0.01 ETH");
        assertEq(decoded.bondSink, sink, "decoded bondSink != input");
    }

    /// Fail-closed decode guards (external seams — library reverts are only
    /// observable through external calls): truncated args segment and a
    /// tampered creation-code prefix both revert BEFORE anything is emitted.
    function test_kitDecode_guardsRevert() public {
        address impl = makeAddr("templatePlaceholder");
        bytes memory data = DeployKitLib.factoryDeployData(impl, sink);

        bytes memory truncated = new bytes(data.length - 1);
        for (uint256 i = 0; i < truncated.length; i++) {
            truncated[i] = data[i];
        }
        vm.expectRevert(bytes("kit: creation data truncated"));
        this._decodeExt(truncated);

        bytes memory tampered = data;
        tampered[0] = bytes1(uint8(tampered[0]) ^ 0xff); // flip a code-prefix byte
        vm.expectRevert(bytes("kit: creation code prefix drift"));
        this._decodeExt(tampered);
    }

    function _decodeExt(bytes memory data) external pure returns (DeployKitLib.FactoryArgs memory) {
        return DeployKitLib.decodeFactoryArgs(data);
    }

    /// Fail-closed tripwire (S2 §4 item 2, Web3Intel c.2): EVERY drifted field
    /// reverts; the clean combination passes. Display alone is never enough.
    function test_kitAssert_driftReverts() public {
        address impl = makeAddr("templatePlaceholder");
        DeployKitLib.FactoryArgs memory clean =
            DeployKitLib.FactoryArgs(impl, 175, 0.01 ether, sink);
        DeployKitLib.assertFactoryArgs(clean, impl, sink); // no revert

        // Fresh struct per case — memory struct assignment ALIASES (no
        // copy), so reusing one `drifted` would corrupt `clean`.
        DeployKitLib.FactoryArgs memory drifted =
            DeployKitLib.FactoryArgs(makeAddr("otherTemplate"), 175, 0.01 ether, sink);
        vm.expectRevert(bytes("kit: decoded template drift"));
        this._assertExt(drifted, impl, sink);

        drifted = DeployKitLib.FactoryArgs(impl, 176, 0.01 ether, sink);
        vm.expectRevert(bytes("kit: decoded totalFeeBps drift"));
        this._assertExt(drifted, impl, sink);

        drifted = DeployKitLib.FactoryArgs(impl, 175, 0.02 ether, sink);
        vm.expectRevert(bytes("kit: decoded bondAmount drift"));
        this._assertExt(drifted, impl, sink);

        drifted = DeployKitLib.FactoryArgs(impl, 175, 0.01 ether, makeAddr("otherSink"));
        vm.expectRevert(bytes("kit: decoded bondSink drift"));
        this._assertExt(drifted, impl, sink);
    }

    function _assertExt(
        DeployKitLib.FactoryArgs memory decoded,
        address templateAddr,
        address bondSinkAddr
    ) external pure {
        DeployKitLib.assertFactoryArgs(decoded, templateAddr, bondSinkAddr);
    }
}

/// @notice F2 (Review54): run()-level proof — drive DeployKit.run() through the
///         real env -> JSON assembly path (vm.setEnv -> script -> file on disk)
///         and verify the emitted JSON field-by-field against DeployKitLib.
///         Flake fix (Review54 MEDIUM on #102): ALL env-driven run() proofs live
///         in ONE sequential test function — vm.setEnv is process-global while
///         forge parallelizes test functions, so sibling env tests raced on
///         KIT_STAGE/TEMPLATE_ADDRESS (~30-50% empirical flakes). Only this
///         contract touches env; within one function the order is deterministic.
contract DeployKitRunTest is Test {
    using stdJson for string;
    address internal tmpl = makeAddr("templatePlaceholder");
    address internal sink = makeAddr("bondSinkPlaceholder");

    function test_run_envDrivenStages_sequential() public {
        // -- 1) template stage ------------------------------------------
        vm.setEnv("KIT_STAGE", "template");
        DeployKit kitTemplate = new DeployKit();
        kitTemplate.run();
        string memory j = vm.readFile("deploy-kit-out/template-deploy.json");
        assertEq(j.readString(".value"), "0x0");
        assertTrue(vm.keyExists(j, ".to"), "to field must be present");
        assertEq(j.readBytes(".data"), DeployKitLib.templateDeployData(), "tx1 data drift");
        // S2 §4 emitters: stage echo + calldataKeccak + decoded bytecodeSha256
        assertEq(j.readString(".stage"), "template");
        assertEq(
            j.readBytes32(".calldataKeccak"),
            keccak256(DeployKitLib.templateDeployData()),
            "calldataKeccak != keccak of emitted bytes"
        );
        assertEq(
            j.readBytes32(".decoded.bytecodeSha256"),
            sha256(DeployKitLib.templateDeployData()),
            "bytecodeSha256 != sha256 of creation code"
        );

        // -- 2) factory stage -------------------------------------------
        vm.setEnv("KIT_STAGE", "factory");
        vm.setEnv("TEMPLATE_ADDRESS", vm.toString(tmpl));
        vm.setEnv("BOND_SINK", vm.toString(sink));
        DeployKit kitFactory = new DeployKit();
        kitFactory.run();
        j = vm.readFile("deploy-kit-out/factory-deploy.json");
        assertEq(j.readString(".kind"), "factory-deploy");
        assertEq(j.readString(".value"), "0x0");
        assertEq(j.readBytes(".data"), DeployKitLib.factoryDeployData(tmpl, sink), "tx2 data drift");
        // S2 §4: decoded block is the round-trip parse of the SAME bytes (the
        // old top-level constructorArgs moved under .decoded per the ceremony
        // payload format).
        assertEq(j.readString(".stage"), "factory");
        assertEq(j.readAddress(".decoded.constructorArgs.template"), tmpl);
        assertEq(j.readUint(".decoded.constructorArgs.totalFeeBps"), 175);
        assertEq(j.readUint(".decoded.constructorArgs.bondAmountWei"), 0.01 ether);
        assertEq(j.readAddress(".decoded.constructorArgs.bondSink"), sink);
        assertEq(
            j.readBytes32(".calldataKeccak"),
            keccak256(DeployKitLib.factoryDeployData(tmpl, sink)),
            "calldataKeccak != keccak of emitted bytes"
        );
        // frozen-constants echo: constants -> payload -> decoded args must
        // match on one screen without re-derivation.
        assertEq(j.readUint(".frozenConstants.totalFeeBps"), 175);
        assertEq(j.readUint(".frozenConstants.bondAmountWei"), 0.01 ether);
        assertEq(j.readAddress(".frozenConstants.bondSink"), sink);

        // -- 3) invalid stage reverts (bogus non-empty value: empty-string
        //       env semantics are process-global and leak — a bogus value is
        //       deterministic) --------------------------------------------
        vm.setEnv("KIT_STAGE", "launch");
        DeployKit kitInvalid = new DeployKit();
        vm.expectRevert(bytes("kit: set KIT_STAGE=template|factory"));
        kitInvalid.run();
    }
}
