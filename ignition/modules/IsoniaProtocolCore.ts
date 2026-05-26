import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("IsoniaProtocolCoreModule", (m) => {
  const isoCore = m.contract("IsoCore");
  const isoProposals = m.contract("IsoProposals", [isoCore]);

  return { isoCore, isoProposals };
});
