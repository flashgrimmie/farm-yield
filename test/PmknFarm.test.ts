import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle"
import { Contract, BigNumber } from "ethers"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { time } from "@openzeppelin/test-helpers";

chai.use(solidity)

describe("PmknFarm Contract", () => {
    
    let res: any;

    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carol: SignerWithAddress;
    let dave: SignerWithAddress;

    let pmknFarm: Contract;
    let mockDai: Contract;
    let pmknToken: Contract;

    const daiAmount: BigNumber = ethers.utils.parseEther("25000");

    before(async() => {
        const PmknFarm = await ethers.getContractFactory("PmknFarm");
        const MockDai = await ethers.getContractFactory("MockDai");
        const PmknToken = await ethers.getContractFactory("PmknToken");

        [owner, alice, bob, carol, dave] = await ethers.getSigners();

        mockDai = await MockDai.deploy()
        pmknToken =  await PmknToken.deploy()

        /*//////////////////////
        // Dai Transfers      //
        //////////////////////*/

        await Promise.all([
            mockDai.mint(owner.address, daiAmount),
            mockDai.mint(alice.address, daiAmount),
            mockDai.mint(bob.address, daiAmount),
            mockDai.mint(carol.address, daiAmount),
            mockDai.mint(dave.address, daiAmount)
        ])

        let pmknFarmParams: Array<string> = [
            mockDai.address,
            pmknToken.address
        ]

        // PmknFarm Contract deployment
        pmknFarm = await PmknFarm.deploy(...pmknFarmParams)

    })

    describe("Init", async() => {
        it("should deploy contracts", async() => {
            expect(pmknFarm).to.be.ok
            expect(pmknToken).to.be.ok
            expect(mockDai).to.be.ok
        })

        it("should return name", async() => {
            expect(await pmknFarm.name())
                .to.eq("Pmkn Farm")
            expect(await mockDai.name())
                .to.eq("MockDai")
            expect(await pmknToken.name())
                .to.eq("PmknToken")
        })

        it("should show mockDai balance", async() => {
            expect(await mockDai.balanceOf(owner.address))
                .to.eq(daiAmount)
            expect(await mockDai.balanceOf(alice.address))
                .to.eq(daiAmount)
            expect(await mockDai.balanceOf(bob.address))
                .to.eq(daiAmount)
            expect(await mockDai.balanceOf(carol.address))
                .to.eq(daiAmount)
        })

    })

    describe("Staking", async() => {
        it("should stake and update mapping", async() => {
            let toTransfer = ethers.utils.parseEther("100")
            await mockDai.connect(alice).approve(pmknFarm.address, toTransfer)

            expect(await pmknFarm.isStaking(alice.address))
                .to.eq(false)
            
            expect(await pmknFarm.connect(alice).stake(toTransfer))
                .to.be.ok

            expect(await pmknFarm.stakingBalance(alice.address))
                .to.eq(toTransfer)
            
            expect(await pmknFarm.isStaking(alice.address))
                .to.eq(true)
        })

        it("should remove dai from user", async() => {
            res = await mockDai.balanceOf(alice.address)
            expect(Number(res))
                .to.be.lessThan(Number(daiAmount))
        })

        it("should revert stake with zero as staked amount", async() => {
            await expect(pmknFarm.connect(bob).stake(0))
                .to.be.revertedWith("You cannot stake zero tokens")
        })

        it("should revert stake without allowance", async() => {
            let toTransfer = ethers.utils.parseEther("50")
            await expect(pmknFarm.connect(bob).stake(toTransfer))
                .to.be.revertedWith("transfer amount exceeds allowance")
        })

        it("should revert with not enough funds", async() => {
            let toTransfer = ethers.utils.parseEther("1000000")
            await mockDai.approve(pmknFarm.address, toTransfer)

            await expect(pmknFarm.connect(bob).stake(toTransfer))
                .to.be.revertedWith("You cannot stake zero tokens")
        })
    })

    describe("Unstaking", async() => {
        it("should unstake balance from user", async() => {
            res = await pmknFarm.stakingBalance(alice.address)
            expect(Number(res))
                .to.be.greaterThan(0)

            await pmknFarm.connect(alice).unstake()

            res = await pmknFarm.stakingBalance(alice.address)
            expect(Number(res))
                .to.eq(0)
        })

        it("should remove staking status", async() => {
            expect(await pmknFarm.isStaking(alice.address))
                .to.eq(false)
        })

        it("should transfer ownership", async() => {
            expect(await pmknToken.owner())
                .to.eq(owner.address)

            await pmknToken._transferOwnership(pmknFarm.address)

            expect(await pmknToken.owner())
                .to.eq(pmknFarm.address)
        })
    })
})

describe("Start from deployment for time increase", () => {
    let res: any
    let expected: any
    
    let alice: SignerWithAddress
    let mockDai: Contract
    let pmknFarm: Contract
    let pmknToken: Contract

    before(async() => {
        // Bare-boned initial deployment setup
        const PmknFarm = await ethers.getContractFactory("PmknFarm");
        const MockDai = await ethers.getContractFactory("MockDai");
        const PmknToken = await ethers.getContractFactory("PmknToken");
        [alice] = await ethers.getSigners();
        mockDai = await MockDai.deploy()
        pmknToken =  await PmknToken.deploy()
        const daiAmount: BigNumber = ethers.utils.parseEther("25000");
        await mockDai.mint(alice.address, daiAmount),
        pmknFarm = await PmknFarm.deploy(mockDai.address, pmknToken.address)
        await pmknToken._transferOwnership(pmknFarm.address)
    })

    describe("Yield", async() => {
        it("should return correct yield time", async() => {
            // Setup
            let toTransfer = ethers.utils.parseEther("10")
            await mockDai.approve(pmknFarm.address, toTransfer)
            await pmknFarm.stake(toTransfer)

            // Start time
            let timeStart = await pmknFarm.startTime(alice.address)
            expect(Number(timeStart))
                .to.be.greaterThan(0)

            // Fast-forward time
            await time.increase(999)

            expect(await pmknFarm.calculateYieldTime(alice.address))
                .to.eq((999))
        })

        it("should mint correct token amount in total supply and user", async() => {           
            let time = await pmknFarm.calculateYieldTime(alice.address)
            let amount = await pmknFarm.stakingBalance(alice.address)
            let newAmount = ethers.utils.formatEther(amount)
            let total = Number(newAmount) * time / 6000            

            await pmknFarm.withdrawYield()

            res = await pmknToken.totalSupply()
            let formatRes = ethers.utils.formatEther(res)

            expect(Number(formatRes))
                .to.be.approximately(total, .002)

            // alice's balance
            res = await pmknToken.balanceOf(alice.address)
            formatRes = ethers.utils.formatEther(res)
            expect(Number(formatRes))
                .to.be.approximately(total, .002)
        })
    })
})