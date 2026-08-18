// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KryptrTokenFactory} from "../src/TokenFactory.sol";
import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";

contract DeployLaunchpad is Script {
    uint16 internal constant TOTAL_FEE_BPS = 175;
    uint256 internal BOND_AMOUNT;
    address internal BOND_SINK;

    KryptrLaunchTokenTemplate internal template;
    KryptrTokenFactory internal factory;

    struct DeploymentInfo {
        string chainName;
        uint256 chainId;
        address templateAddress;
        address factoryAddress;
        uint256 blockNumber;
        uint256 timestamp;
        string commitHash;
    }

    DeploymentInfo internal deployment;

    function setUp() public view virtual {
        BOND_AMOUNT = vm.envOr("BOND_AMOUNT", uint256(1 ether));
        BOND_SINK = vm.envAddress("BOND_SINK");
        require(BOND_SINK != address(0), "BOND_SINK cannot be zero");
    }

    function run() external {
        console.log("[DEPLOY] Wave-5 Launchpad Initialization");
        console.log("Total Fee BPS:", TOTAL_FEE_BPS);

        vm.startBroadcast();
        template = new KryptrLaunchTokenTemplate();
        address templateAddr = address(template);
        console.log("[OK] Template deployed at:", templateAddr);

        factory = new KryptrTokenFactory(templateAddr, TOTAL_FEE_BPS, BOND_AMOUNT, BOND_SINK);
        address factoryAddr = address(factory);
        console.log("[OK] Factory deployed at:", factoryAddr);
        console.log("");

        require(factory.template() == address(template), "template mismatch");
        require(factory.totalFeeBps() == TOTAL_FEE_BPS, "totalFeeBps mismatch");
        require(factory.bondAmount() == BOND_AMOUNT, "bondAmount mismatch");
        require(factory.bondSink() == BOND_SINK, "bondSink mismatch");

        console.log("[OK] Factory immutable parameters verified");
        console.log("  - totalFeeBps:", factory.totalFeeBps());
        console.log("  - bondAmount:", factory.bondAmount());

        vm.stopBroadcast();

        deployment.chainName = block.chainid == 84532 ? "base-sepolia" : "robinhood";
        deployment.chainId = block.chainid;
        deployment.templateAddress = templateAddr;
        deployment.factoryAddress = factoryAddr;
        deployment.blockNumber = block.number;
        deployment.timestamp = block.timestamp;
        bytes memory hashBytes = bytes(vm.envString("COMMIT_HASH"));
        deployment.commitHash = hashBytes.length >= 7 ? 
            string(hashBytes[0:7]) : "local-dev";

        emitDeploymentManifest();

        console.log("");
        console.log("=============================");
        console.log("DEPLOYMENT COMPLETE [OK]");
        console.log("=============================");
    }

    function emitDeploymentManifest() internal {
        string memory manifestPath = string.concat("deployments/", deployment.chainName, ".json");
        string memory manifest = string.concat(
            '{"chain":"', deployment.chainName,
            '","factoryAddress":"', abi.encodePacked(deployment.factoryAddress),
            '","bondSink":"', abi.encodePacked(BOND_SINK),
            '", "verificationId": null,"commitSha":"', deployment.commitHash,
            '","deployedAt":"', vm.toString(deployment.timestamp), '"}'
        );
        vm.writeFile(manifestPath, manifest);
        console.log("Manifest written:", manifestPath);
    }
}
