import { expect } from "chai";
import { network } from "hardhat";
import type { BaseContract } from "ethers";

const hardhatRuntime: Awaited<ReturnType<typeof network.create>> = await network.create();
const { ethers } = hardhatRuntime;
type EthersHelpers = typeof ethers;
type DeployedContract = BaseContract;
type SignerWithAddress = Awaited<ReturnType<EthersHelpers["getSigners"]>>[number];

interface TokenContext {
  readonly token: DeployedContract;
  readonly owner: SignerWithAddress;
  readonly holder: SignerWithAddress;
  readonly outsider: SignerWithAddress;
}

async function deployToken(): Promise<TokenContext> {
  const [owner, holder, outsider]: SignerWithAddress[] = await ethers.getSigners();
  const token = await ethers.deployContract("IsoDemoVotesToken", [owner.address]) as unknown as DeployedContract;
  return { token, owner, holder, outsider };
}

async function readBigInt(contract: DeployedContract, methodName: string, args: readonly unknown[] = []): Promise<bigint> {
  const method = contract.getFunction(methodName);
  const result: unknown = await method(...args);
  return result as bigint;
}

describe("IsoDemoVotesToken", function () {
  it("allows the demo owner to mint tokens", async function (): Promise<void> {
    const { token, holder } = await deployToken();
    const amount = ethers.parseEther("100");

    await expect(token.getFunction("mint")(holder.address, amount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, holder.address, amount);

    expect(await readBigInt(token, "balanceOf", [holder.address])).to.equal(amount);
  });

  it("rejects demo minting from non-owner accounts", async function (): Promise<void> {
    const { token, holder, outsider } = await deployToken();

    await expect(token.connect(outsider).getFunction("mint")(holder.address, ethers.parseEther("1")))
      .to.be.revertedWithCustomError(token, "Unauthorized")
      .withArgs(outsider.address);
  });

  it("supports self-delegation and current vote power", async function (): Promise<void> {
    const { token, holder } = await deployToken();
    const amount = ethers.parseEther("250");
    await token.getFunction("mint")(holder.address, amount);

    await token.connect(holder).getFunction("delegate")(holder.address);

    expect(await readBigInt(token, "getVotes", [holder.address])).to.equal(amount);
  });

  it("exposes historical voting power after delegation", async function (): Promise<void> {
    const { token, holder } = await deployToken();
    const amount = ethers.parseEther("500");
    await token.getFunction("mint")(holder.address, amount);
    const delegateTransaction = await token.connect(holder).getFunction("delegate")(holder.address);
    const delegateReceipt = await delegateTransaction.wait();
    if (delegateReceipt === null) {
      throw new Error("missing delegate transaction receipt");
    }
    const delegatedBlock = BigInt(delegateReceipt.blockNumber);

    await ethers.provider.send("evm_mine", []);

    expect(await readBigInt(token, "getPastVotes", [holder.address, delegatedBlock])).to.equal(amount);
  });
});
