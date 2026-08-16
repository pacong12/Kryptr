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
            bytes memory data = DeployKitLib.templateDeployData();
            string memory json = string.concat(
                '{"kind":"template-deploy","signer":"operator (kit never signs)",',
                '"to":null,"value":"0x0","data":"',
                _hex(data),
                '"}'
            );
            vm.writeFile("deploy-kit-out/template-deploy.json", json);
            console.log("kit: wrote deploy-kit-out/template-deploy.json (tx1)");
        } else {
            address templateAddr = vm.envAddress("TEMPLATE_ADDRESS");
            address bondSink = vm.envAddress("BOND_SINK");
            bytes memory data = DeployKitLib.factoryDeployData(templateAddr, bondSink);
            string memory json = string.concat(
                '{"kind":"factory-deploy","signer":"operator (kit never signs)",',
                '"to":null,"value":"0x0","data":"',
                _hex(data),
                '","constructorArgs":{"template":"',
                _hex20(templateAddr),
                '","totalFeeBps":',
                vm.toString(uint256(DeployKitLib.TOTAL_FEE_BPS)),
                ',"bondAmountWei":"',
                vm.toString(DeployKitLib.BOND_AMOUNT),
                '","bondSink":"',
                _hex20(bondSink),
                '"}}'
            );
            vm.writeFile("deploy-kit-out/factory-deploy.json", json);
            console.log("kit: wrote deploy-kit-out/factory-deploy.json (tx2)");
        }
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
}
