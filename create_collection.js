const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const config = require('./config');
const fs = require('fs');

function strToUTF16(str) {
  let buf = [];
  for (let i=0, strLen=str.length; i < strLen; i++) {
    buf.push(str.charCodeAt(i));
  }
  return buf;
}

function getCreatedCollectionId(events) {
  let success = false;
  let collectionId = 0;
  events.forEach(({ phase, event: { data, method, section } }) => {
    // console.log(`    ${phase}: ${section}.${method}:: ${data}`);
    if (method == 'ExtrinsicSuccess') {
      success = true;
    } else if ((section == 'nft')  && (method == 'CollectionCreated')) {
      collectionId = parseInt(data[0].toString());
    }
  });
  return collectionId;
}

function submitTransaction(sender, transaction) {
  return new Promise(async function(resolve, reject) {
    try {
      const unsub = await transaction
      .signAndSend(sender, (result) => {
        console.log(`Current tx status is ${result.status}`);
    
        if (result.status.isInBlock) {
          console.log(`Transaction included at blockHash ${result.status.asInBlock}`);
        } else if (result.status.isFinalized) {
          console.log(`Transaction finalized at blockHash ${result.status.asFinalized}`);
          let id = getCreatedCollectionId(result.events);
          resolve(id);
          unsub();
        }
      });
    }
    catch (e) {
      reject(e.toString());
    }
  });
}

async function createCollectionAsync(api, signer) {
  const name = "Hypercube Space3";
  const description = "Fundraising initiative to allow HyperCube Space to host artists working with cutting edge technologies in the metaverse. 74 second video created in VR environment. Sound design @David McAulay";
  const tokenPrefix = "HCUBE";
  const modeprm = {nft: null};

  const tx = api.tx.nft.createCollection(strToUTF16(name), strToUTF16(description), strToUTF16(tokenPrefix), modeprm);
  return await submitTransaction(signer, tx);
}

async function main() {
  // Initialise the provider to connect to the node
  const wsProvider = new WsProvider(config.wsEndpoint);
  const rtt = JSON.parse(fs.readFileSync("./runtime_types.json"));

  // Create the API and wait until ready
  const api = await ApiPromise.create({ 
    provider: wsProvider,
    types: rtt
  });

  // Owners's keypair
  const keyring = new Keyring({ type: 'sr25519' });
  const owner = keyring.addFromUri(config.ownerSeed);
  console.log("Collection owner address: ", owner.address);

  // Create collection as owner
  console.log("=== Create collection ===");
  const collectionId = await createCollectionAsync(api, owner);
  console.log(`Collection created: ${collectionId}`);

  // Set onchain schema
  console.log("=== Set const on-chain schema ===");
  const schema = (fs.readFileSync(`${config.outputFolder}/${config.outputSchema}`)).toString();
  const tx4 = api.tx.nft.setConstOnChainSchema(collectionId, strToUTF16(schema));
  await submitTransaction(owner, tx4);

  // Set offchain schema
  console.log("=== Set schema version ===");
  const tx2 = api.tx.nft.setSchemaVersion(collectionId, 'ImageURL');
  await submitTransaction(owner, tx2);

  console.log("=== Set offchain schema ===");
  const tx3 = api.tx.nft.setOffchainSchema(collectionId, `https://ipfs.artpool.xyz/ipfs/Qmdxoh4U8azYQUaQfpiXvWmEG4AVCWEduFD8n4RqYzsWAM/hypercubespace_gif{id}.gif`);
  await submitTransaction(owner, tx3);
}

main().catch(console.error).finally(() => process.exit());
