const { balance, BN, constants, ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { tracker } = balance;
const { latest } = time;
const abi = require('ethereumjs-abi');
const utils = web3.utils;

const { expect } = require('chai');

const HUniswap = artifacts.require('HUniswap');
const Proxy = artifacts.require('Proxy');
const IToken = artifacts.require('IERC20');
const IUniswapExchange = artifacts.require('IUniswapExchange');

async function resetAccount(account) {
    const ETHProvider = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const d = ether('100').sub(new BN(await web3.eth.getBalance(account)));
    if (d.isZero())
        return;
    else if (d.isNeg())
        await web3.eth.sendTransaction({ from: account, to: ETHProvider, value: d.neg() });
    else
        await web3.eth.sendTransaction({ from: ETHProvider, to: account, value: d });
}

contract('Swap', function ([_, deployer, user1, user2]) {
    beforeEach(async function () {
        await resetAccount(_);
        await resetAccount(user1);
        await resetAccount(user2);
    });

    const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
    const DAISwap = '0x2a1530C4C41db0B0b2bB646CB5Eb1A67b7158667';

    before(async function () {
        this.proxy = await Proxy.new({ from: deployer });
        this.huniswap = await HUniswap.new({ from: deployer });
        this.dai = await IToken.at(DAI);
        this.daiswap = await IUniswapExchange.at(DAISwap);
    });

    describe('Exact input', function () {
        let balanceUser1;
        let balanceUser2;
        let balanceProxy;

        beforeEach(async function () {
            balanceUser1 = await tracker(user1);
            balanceUser2 = await tracker(user2);
            balanceProxy = await tracker(this.proxy.address);
        });

        it('normal', async function () {
            const value = [ether('1')];
            const to = [this.huniswap.address];
            const data = [
                abi.simpleEncode('ethToTokenSwapInput(uint256,address,uint256):(uint256)', value[0], DAI, new BN('1'))
            ];
            const deadline = (await latest()).add(new BN('100'));
            const uniswapAmount = await this.daiswap.ethToTokenSwapInput.call(
                new BN('1'),
                deadline,
                { from: user1, value: ether('1') }
            );
            const receipt = await this.proxy.batchExec(to, data, { from: user1, value: ether('1') });
            expect(await this.dai.balanceOf.call(user1)).to.be.bignumber.eq(uniswapAmount);
            expect(await this.dai.balanceOf.call(this.proxy.address)).to.be.bignumber.eq(ether('0'));
            expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
            expect(await balanceUser1.delta()).to.be.bignumber.eq(
                ether('0').sub(
                    ether('1')
                ).sub(
                    new BN(receipt.receipt.gasUsed)
                )
            );
        });

        it('min amount too high', async function () {
            const value = [ether('1')];
            const to = [this.huniswap.address];
            const deadline = (await latest()).add(new BN('100'));
            const uniswapAmount = await this.daiswap.ethToTokenSwapInput.call(
                new BN('1'),
                deadline,
                { from: user2, value: ether('1') }
            );
            const data = [
                abi.simpleEncode(
                    'ethToTokenSwapInput(uint256,address,uint256):(uint256)',
                    value[0],
                    DAI,
                    uniswapAmount.add(ether('0.1'))
                )
            ];
            await expectRevert.unspecified(
                this.proxy.batchExec(to, data, { from: user2, value: ether('1') })
            );
            expect(await this.dai.balanceOf.call(user2)).to.be.bignumber.eq(ether('0'));
            expect(await this.dai.balanceOf.call(this.proxy.address)).to.be.bignumber.eq(ether('0'));
            expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
            //should get user gas usage
            //expect(await balanceUser2.delta()).to.be.bignumber.eq(ether('0'));
        });
    });
});
