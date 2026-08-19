// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import "../src/TokenFactory.sol";
import "../src/TokenTemplate.sol";

contract DeployLaunchpadMainnet is Script {
    KryptrTokenFactory public factory;
    
    function run() external {
        uint256 deployerPK = vm.envUint("PRIVATE_KEY_MAINNET");
        address payable deployer = payable(vm.addr(deployerPK));
        
        console.log("MAINNET Deployment Starting...");
        console.log("Deployer:", deployer);
        
        // Deploy TokenFactory with immutable parameters
        factory = new KryptrTokenFactory(
            deployer,          // Template placeholder
            175,               // Total fee bps (RATE)
            10 ether,          // Bond amount for mainnet
            payable(deployer)   // Initial bond sink
        );
        
        console.log("Factory deployed at:", address(factory));
        console.log("Bond amount:", factory.bondAmount());
        
        bytes32 create2Salt = vm.envBytes32("CREATE2_SALT");
        
        // Predict vault address using CREATE2 (EIP-1014)
        address predictedAddr = predictContractAddress(create2Salt);
        console.log("Predicted CREATE2 vault address:", predictedAddr);
        
        console.log("All systems operational for Mainnet!");
    }
    
    function predictContractAddress(bytes32 salt) internal view returns (address addr) {
        bytes memory initCode = abi.encodePacked(
            type(KryptrLaunchTokenTemplate).creationCode,
            abi.encode(address(factory))
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(initCode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
