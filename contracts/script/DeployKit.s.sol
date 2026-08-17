// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DeployKitLib} from "./DeployKitLib.sol";

/// @title DeployKit — OFFLINE, simulate-only deploy artifact generator (wave 6)
/// @notice Emits the EXACT two deploy transactions as JSON for a human operator
///         to sign and broadcast from their OWN wallet. Security shape:
///           - NO vm.broadcast / vm.startBroadcast anywhere (nothing to leak);
///           - NO signing code and NO key material by construction;
///           - NO chain reads: runs under `forge script --offline`;
///           - output is calldata-only; the operator is the trust anchor,
///             exactly like T21 consent (human approves the exact thing).
///
///         Two stages (template MUST land before factory — the factory
///         constructor requires the live template address):
///           KIT_STAGE=template forge script script/DeployKit.s.sol --offline
///               -> deploy-kit-out/template-deploy.json   (tx1)
///           KIT_STAGE=factory TEMPLATE_ADDRESS=0x... BOND_SINK=0x... \
///               forge script script/DeployKit.s.sol --offline
///               -> deploy-kit-out/factory-deploy.json    (tx2)
///
///         Frozen params (Main, wave-5 closing ruling): totalFeeBps=175,
///         bondAmount=0.01 ETH. BOND_SINK has NO default: unset or zero
///         address fails closed.
///
///         S2 §4 emitters (drift-proof by construction): every payload also
///         carries calldataKeccak (over the exact bytes written), a `decoded`
///         block parsed back FROM those same bytes (template stage:
///         bytecodeSha256 of the creation code; factory stage: the
///         constructor args round-trip-decoded and fail-closed-asserted
///         against the frozen constants), and a stage + constants echo.
contract DeployKit is Script {
    function run() external {
        string memory stage = vm.envOr("KIT_STAGE", string(""));
        require(
            keccak256(bytes(stage)) == keccak256("template")
                || keccak256(bytes(stage)) == keccak256("factory"),
            "kit: set KIT_STAGE=template|factory"
        );

        vm.createDir("deploy-kit-out", true);

        if (keccak256(bytes(stage)) == keccak256("template")) {
            _runTemplateStage();
        } else {
            _runFactoryStage();
        }
    }

    /// @dev tx1 emission. The JSON is built in shallow concat chains
    ///      (legacy codegen stack budget — via-ir is deliberately OFF for
    ///      bytecode determinism against the release tag).
    function _runTemplateStage() internal {
        bytes memory data = DeployKitLib.templateDeployData();
        bytes32 calldataKeccak = keccak256(data);
        bytes32 bytecodeSha = sha256(data);
        string memory j = string.concat(
            '{"kind":"template-deploy","stage":"template",',
            '"signer":"operator (kit never signs)",',
            '"to":null,"value":"0x0","data":"',
            _hex(data)
        );
        j = string.concat(
            j,
            '","calldataKeccak":"',
            _hex32(calldataKeccak),
            '","decoded":{"kind":"template-deploy","bytecodeSha256":"'
        );
        j = string.concat(j, _hex32(bytecodeSha), '","constructorArgs":[]}}');
        vm.writeFile("deploy-kit-out/template-deploy.json", j);
        console.log("kit: wrote deploy-kit-out/template-deploy.json (tx1)");
        console.log("kit: stage=template calldataKeccak", _hex32(calldataKeccak));
        console.log("kit: stage=template bytecodeSha256", _hex32(bytecodeSha));
    }

    /// @dev tx2 emission. Calldata keccak is computed over the SAME in-memory
    ///      bytes that get written (S2 §4 item 3 — one source, one hash).
    function _runFactoryStage() internal {
        address templateAddr = vm.envAddress("TEMPLATE_ADDRESS");
        address bondSink = vm.envAddress("BOND_SINK");
        bytes memory data = DeployKitLib.factoryDeployData(templateAddr, bondSink);
        bytes32 calldataKeccak = keccak256(data);
        string memory j = _factoryJson(data, templateAddr, bondSink, calldataKeccak);
        vm.writeFile("deploy-kit-out/factory-deploy.json", j);
        console.log("kit: wrote deploy-kit-out/factory-deploy.json (tx2)");
        console.log("kit: stage=factory calldataKeccak", _hex32(calldataKeccak));
    }

    /// @dev Factory payload assembly with the round-trip proof inline (S2 §4):
    ///      decode the constructor args FROM the exact creation bytes, then
    ///      fail-closed-assert them against frozen constants + operator inputs
    ///      BEFORE anything is emitted. The `decoded` block the signer reads
    ///      is literally the bytes being sent, parsed back — summary drift is
    ///      structurally impossible. `frozenConstants` echoes the anchor
    ///      values so constants -> payload -> decoded args match on one
    ///      screen without re-derivation.
    function _factoryJson(
        bytes memory data,
        address templateAddr,
        address bondSink,
        bytes32 calldataKeccak
    ) internal returns (string memory) {
        DeployKitLib.FactoryArgs memory decoded = DeployKitLib.decodeFactoryArgs(data);
        DeployKitLib.assertFactoryArgs(decoded, templateAddr, bondSink);
        string memory j = string.concat(
            '{"kind":"factory-deploy","stage":"factory",',
            '"signer":"operator (kit never signs)",',
            '"to":null,"value":"0x0","data":"',
            _hex(data)
        );
        j = string.concat(
            j,
            '","calldataKeccak":"',
            _hex32(calldataKeccak),
            '","decoded":{"kind":"factory-deploy","constructorArgs":{"template":"'
        );
        j = string.concat(
            j,
            _hex20(decoded.template),
            '","totalFeeBps":',
            vm.toString(uint256(decoded.totalFeeBps)),
            ',"bondAmountWei":"'
        );
        j = string.concat(
            j,
            vm.toString(decoded.bondAmount),
            '","bondSink":"',
            _hex20(decoded.bondSink),
            '"}},"frozenConstants":{"totalFeeBps":'
        );
        j = string.concat(
            j,
            vm.toString(uint256(DeployKitLib.TOTAL_FEE_BPS)),
            ',"bondAmountWei":"',
            vm.toString(DeployKitLib.BOND_AMOUNT),
            '","bondSink":"'
        );
        j = string.concat(j, _hex20(bondSink), '"}}');
        return j;
    }

    /// @dev bytes -> 0x-prefixed lowercase hex (deterministic, zero-dep).
    function _hex(bytes memory b) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory out = new bytes(2 + b.length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < b.length; i++) {
            out[2 + i * 2] = alphabet[uint8(b[i]) >> 4];
            out[3 + i * 2] = alphabet[uint8(b[i]) & 0x0f];
        }
        return string(out);
    }

    function _hex20(address a) internal pure returns (string memory) {
        return _hex(abi.encodePacked(a));
    }

    function _hex32(bytes32 h) internal pure returns (string memory) {
        return _hex(abi.encodePacked(h));
    }
}
