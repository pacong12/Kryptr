// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KryptrTokenFactory} from "../src/TokenFactory.sol";
import {KryptrLaunchTokenTemplate} from "../src/TokenTemplate.sol";

contract DeployLaunchpadMainnet is Script {
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

    function setUp() public virtual {
        // Mainnet configuration - MultiSig wallet as bond sink for enhanced security
        BOND_AMOUNT = vm.envOr("BOND_AMOUNT", uint256(10 ether)); // Increased for mainnet
        BOND_SINK = vm.envAddress("BOND_SINK");
        require(BOND_SINK != address(0), "BOND_SINK cannot be zero");
        require(BOND_SINK == tx.origin || msg.sender == tx.origin, "Only authorized signer allowed");
    }

    function run() external {
        console.log("[DEPLOY] Wave-5 Mainnet Launchpad Initialization");
        console.log("Chain ID:", block.chainid);
        console.log("Total Fee BPS:", TOTAL_FEE_BPS);
        console.log("Bond Amount:", BOND_AMOUNT);
        console.log("Bond Sink:", BOND_SINK);

        uint256 startGas = gasleft();

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

        uint256 endGas = gasleft();
        uint256 gasUsed = startGas - endGas;
        
        console.log("");
        console.log("=============================");
        console.log("DEPLOYMENT COMPLETE [OK]");
        console.log("=============================");
        console.log("Gas used for deployment:", gasUsed);
        console.log("Gas limit target: < 2,500,000");
        require(gasUsed < 2500000, "Deployment exceeded gas limit target");
    }

    function emitDeploymentManifest() internal {
        string memory manifestPath = string.concat("deployments/", deployment.chainName, ".json");
        string memory factoryAddrStr = vm.toString(deployment.factoryAddress);
        string memory templateAddrStr = vm.toString(deployment.templateAddress);
        string memory bondAmountStr = vm.toString(deployment.bondAmount);
        string memory totalFeeBpsStr = vm.toString(deployment.totalFeeBps);

        string memory json = vm.serializeAddress("deployment", "factoryAddress", deployment.factoryAddress);
        json = vm.serializeAddress(json, "templateAddress", deployment.templateAddress);
        json = vm.serializeUint(json, "bondAmount", deployment.bondAmount);
        json = vm.serializeUint(json, "totalFeeBps", deployment.totalFeeBps);
        json = vm.serializeString(json, "commitHash", deployment.commitHash);
        json = vm.serializeUint(json, "blockNumber", deployment.blockNumber);
        json = vm.serializeUint(json, "timestamp", deployment.timestamp);

        string memory finalJson = vm.serializeString(json, "chainName", deployment.chainName);
        vm.writeJson(finalJson, manifestPath);

        console.log("[MANIFEST] Written to:", manifestPath);
    }
}
