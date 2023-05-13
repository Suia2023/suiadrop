import {bcs, RawSigner, SuiObjectChangeCreated, SuiObjectChangePublished, TransactionBlock,} from "@mysten/sui.js";
import {prepareAmount, provider, publish, sendTx, signer} from "./common";
import * as path from "path";
import * as fs from "fs";

interface PublishResult {
  packageId: string;
  globalId: string;
}

let tx = new TransactionBlock();

async function publishSuiadrop(signer: RawSigner): Promise<PublishResult> {
  // publish
  const publishTxn = await publish(
    path.join(__dirname, "."),
    signer
  );
  const packageId = (
    publishTxn.objectChanges!.filter(
      (o) => o.type === "published"
    )[0] as SuiObjectChangePublished
  ).packageId as string;
  const globalId = (
    publishTxn.objectChanges!.filter(
      (o) => o.type === "created" && o.objectType.endsWith("::suiadrop::Global")
    )[0] as SuiObjectChangeCreated
  ).objectId as string;
  return {
    packageId,
    globalId,
  };
}

async function interact(whitelistPath: string, publishResult: PublishResult, signer: RawSigner) {
  const {packageId, globalId} = publishResult;
  const fileContent = fs.readFileSync(whitelistPath, 'utf-8');
  let whitelist = fileContent.trim().split('\n');
  whitelist = whitelist.slice(0, 600)
  whitelist.push(await signer.getAddress() as string);
  console.log(`whitelist length: ${whitelist.length}`);
  const batchSize = 511;

  // deposit token
  const reward_num = 1000000001n; // replace with suia token decimal * whitelist length
  let coinType = "0x2::sui::SUI"; // replace with suia token
  const prepareAmountRes = await prepareAmount(
    coinType,
    BigInt(reward_num),
    signer
  );
  tx = prepareAmountRes.tx;
  tx.moveCall({
    target: `${packageId}::suiadrop::deposit`,
    arguments: [
      tx.object(globalId),
      prepareAmountRes.txCoin,
    ],
    typeArguments: [coinType],
  });
  const depositTxn = await sendTx(tx, signer);
  console.log("depositTxn", JSON.stringify(depositTxn, null, 2));

  // add whitelist
  for (let i = 0; i < whitelist.length; i += batchSize) {
    tx = new TransactionBlock();
    const whitelistBytes = bcs.ser('vector<address>', whitelist.slice(i, i+batchSize), {maxSize: 1024 * 16}).toBytes();
    tx.moveCall({
      target: `${packageId}::suiadrop::add_whitelist`,
      arguments: [
        tx.object(globalId),
        tx.pure(whitelistBytes),
      ],
    });
    const addWhitelistTxn = await sendTx(tx, signer);
    console.log("addWhitelistTxn", JSON.stringify(addWhitelistTxn, null, 2));
    console.log(`addWhitelistTxn ${i} - ${i + batchSize - 1} done`);
  }

  // claim
  tx = new TransactionBlock();
  tx.moveCall({
    target: `${packageId}::suiadrop::claim`,
    arguments: [
      tx.object(globalId),
    ],
    typeArguments: [coinType],
  });
  const claimTxn = await sendTx(tx, signer);
  console.log("claimTxn", JSON.stringify(claimTxn, null, 2));

  // withdraw
  tx = new TransactionBlock();
  tx.moveCall({
    target: `${packageId}::suiadrop::withdraw`,
    arguments: [
      tx.object(globalId),
    ],
    typeArguments: [coinType],
  });
  const withdrawTxn = await sendTx(tx, signer);
  console.log("withdrawTxn", JSON.stringify(withdrawTxn, null, 2));
}

async function queries(publishResult: PublishResult, addr: string) {
  const {packageId, globalId} = publishResult;
  const global = await provider.getObject({
    id: globalId,
    options: {
      showContent: true,
    }
  });
  console.log("global", JSON.stringify(global, null, 2));
  const whitelistTableId = (global.data as any).content.fields.whitelist.fields.id.id as string;
  console.log("whitelistTableId", whitelistTableId);

  // get all whitelist
  const whitelists = await provider.getDynamicFields({
    parentId: whitelistTableId,
  });
  console.log("whitelists", JSON.stringify(whitelists, null, 2));

  // check whether an address is in whitelist / claimed
  const value = await provider.getDynamicFieldObject({
    parentId: whitelistTableId,
    name: {
      type: 'address',
      // value: '0xee47ec7efda253421ef6f73a1245467567ad44489ebd4da462df7f061fb272a0',  // an address not in whitelist
      value: addr,
    },
  });
  console.log("value", JSON.stringify(value, null, 2));
  if(value.error) {
    // value {
    //   "error": {
    //     "code": "dynamicFieldNotFound",
    //       "parent_object_id": "0xcc295b039cb6530f8c8b7bcfde35a4d6a28fcfa77ae940f704bcfa2c40935c05"
    //   }
    // }
    console.log(`address ${addr} is not in whitelist`);
  } else {
    let claimed = (value.data as any).content.fields.value;
    console.log(`address ${addr} is in whitelist, claimed: ${claimed}`);
  }
}

async function main() {
  console.log("-----start-----");
  const addr = await signer.getAddress();
  console.log(`address: ${addr}`);
  // get coin from faucet
  const res = await provider.requestSuiFromFaucet(addr);
  console.log("requestSuiFromFaucet", JSON.stringify(res, null, 2));

  const publishResult = await publishSuiadrop(signer);
  // const publishResult = {
  //   packageId: '0x98ba0963090083a4a959ec5ad1808d2ce321e1d2dd5b130a167e4851540f05e7',
  //   globalId: '0x27d6feb3dc988a4d696dda547febc47aee284e30dccb87b5163a3723c9057e3b',
  // }
  console.log(`PublishResult: ${JSON.stringify(publishResult, null, 2)}`);

  await interact("demo/whitelist.txt", publishResult, signer);
  await queries(publishResult, addr as string);
  console.log("-----end-----");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`error: ${JSON.stringify(error, null, 2)}, ${error.stack}`);
    process.exit(1);
  });
