import ethers from 'ethers';
import { CHAINS } from './config.js';
import logger from './logger.js';


const instanceRegistryAbi = [
  'function getAllInstanceAddresses() view returns (address[])',
  'function instances(address) view returns (bool isERC20, address token, uint256 denomination, uint8 state, uint24 poolSwappingFee, uint32 protocolFeePercentage)'
];

const depositInterface = new ethers.utils.Interface(['event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)']);
const withdrawalInterface = new ethers.utils.Interface(['event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)']);
const encryptedNoteInterface = new ethers.utils.Interface(['event EncryptedNote(address indexed sender, bytes encryptedNote)']);
const relayerRegisteredInterface = new ethers.utils.Interface(['event RelayerRegistered(string hostName, address relayerAddress, uint256 stakedAmount)']);
const echoInterface = new ethers.utils.Interface(['event Echo(address indexed who, bytes data)']);
const delegatedInterface = new ethers.utils.Interface(['event Delegated(address indexed account, address indexed to)']);
const undelegatedInterface = new ethers.utils.Interface(['event Undelegated(address indexed account, address indexed from)']);

const depositTopic = ethers.utils.id('Deposit(bytes32,uint32,uint256)'); //0xa945e51eec50ab98c161376f0db4cf2aeba3ec92755fe2fcd388bdbbb80ff196
const withdrawalTopic = ethers.utils.id('Withdrawal(address,bytes32,address,uint256)'); //0xe9e508bad6d4c3227e881ca19068f099da81b5164dd6d62b2eaf1e8bc6c34931
const encryptedNoteTopic = ethers.utils.id('EncryptedNote(address,bytes)'); //0xfa28df43db3553771f7209dcef046f3bdfea15870ab625dcda30ac58b82b4008
const relayerRegisteredTopic = ethers.utils.id('RelayerRegistered(string,address,uint256)'); //0xd990ed339689bebddd7213a2e86c5db4212ac6ef4b3d2e58e3fe2a342afed23a
const echoTopic = ethers.utils.id('Echo(address,bytes)'); //0x50d6f3fc915efd1695d8a4cb50da185984f50d256834b9cb308295eb3c872c9c
const delegatedTopic = ethers.utils.id('Delegated(address,address)');
const undelegatedTopic = ethers.utils.id('Undelegated(address,address)');


const multicallAbi = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)'
];

async function poll(chain, db) {

  const config = CHAINS[chain];
  const provider = new ethers.providers.StaticJsonRpcProvider(config.RPC_URL, config.CHAIN_ID);
  const instanceRegistry = new ethers.Contract(config.INSTANCE_REGISTRY_ADDRESS, instanceRegistryAbi, provider);
  const multicall = new ethers.Contract(config.MULTICALL3_ADDRESS, multicallAbi, provider);

  try {

    // Fetch instances (assuming they don't change often, can be outside loop if needed)
    const instances = await instanceRegistry.getAllInstanceAddresses();

    const calls = instances.map(inst => ({
      target: config.INSTANCE_REGISTRY_ADDRESS,
      allowFailure: false,
      callData: instanceRegistry.interface.encodeFunctionData('instances', [inst])
    }));

    const results = await multicall.aggregate3(calls);

    const instanceDetails = {};
    results.forEach((result, i) => {
      const [success, retData] = result;
      if (success) {
        const [isERC20, token, denomination, state] = instanceRegistry.interface.decodeFunctionResult('instances', retData);
        if (state === 1) {
          instanceDetails[instances[i]] = {
            currency: isERC20 ? token.toLowerCase() : 'etn',
            amount: denomination.toString()
          };
        }
      } else {
        logger.error(`Failed to fetch details for instance ${instances[i]}`);
      }
    });

    // Create a Set for quick lookup
    const instanceSet = new Set(instances.map(addr => addr.toLowerCase()));

    const lastBlock = await db.getLastBlock();
    let currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let from = lastBlock + 1;
    logger.debug(`${chain} - Polling from block ${from} to ${currentBlock}`);
        
    while (from <= currentBlock) {
      const to = Math.min(from + 999, currentBlock); // 1000 blocks max

      // Fetch all relevant logs in one call
      const allLogs = await provider.getLogs({
        fromBlock: from,
        toBlock: to,
        topics: [[depositTopic, withdrawalTopic, encryptedNoteTopic, relayerRegisteredTopic, echoTopic, delegatedTopic, undelegatedTopic]]
      });

      // Filter for instance logs
      const instanceLogs = allLogs.filter(log => 
        instanceSet.has(log.address.toLowerCase()) && 
        (log.topics[0] === depositTopic || log.topics[0] === withdrawalTopic)
      );

      // Process instance logs
      for (const log of instanceLogs) {
        const instDetail = instanceDetails[log.address];
        if (!instDetail) continue;

        let eventType;
        if (log.topics[0] === depositTopic) {
          eventType = 'Deposit';
          const decoded = depositInterface.parseLog(log);
          const { commitment, leafIndex, timestamp } = decoded.args;
          const data = {
            currency: instDetail.currency,
            amount: formatAmount(instDetail.amount),
            index: leafIndex,
            timestamp: timestamp.toNumber(),
            blockNumber: log.blockNumber,
            commitment,
            transactionHash: log.transactionHash
          };
          await db.insert('deposits', data);

        } 
        else if (log.topics[0] === withdrawalTopic) {
          eventType = 'Withdrawal';
          const decoded = withdrawalInterface.parseLog(log);
          const { to, nullifierHash, relayer, fee } = decoded.args;
          const block = await provider.getBlock(log.blockNumber);
          const data = {
            currency: instDetail.currency,
            amount: formatAmount(instDetail.amount),
            to,
            fee: fee.toString(),
            nullifier: nullifierHash,
            timestamp: block.timestamp,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash
          };
          await db.insert('withdrawals', data);

        }

        logger.info(`${chain} - ${eventType} on block ${log.blockNumber}`);
      }

      // Filter for router logs
      const routerLogs = allLogs.filter(log => 
        log.address.toLowerCase() === config.ROUTER_ADDRESS.toLowerCase() && 
        log.topics[0] === encryptedNoteTopic
      );

      // Process router logs (encrypted notes)
      let globalNoteIndex = await db.getMaxIndex('encryptedNotes');
      for (const log of routerLogs) {
        const decoded = encryptedNoteInterface.parseLog(log);
        const { sender, encryptedNote } = decoded.args;
        globalNoteIndex += 1;
        const encNoteData = {
          index: globalNoteIndex,
          blockNumber: log.blockNumber,
          encryptedNote: ethers.utils.hexlify(encryptedNote),
          transactionHash: log.transactionHash
        };
        await db.insert('encryptedNotes', encNoteData);

        logger.info(`${chain} - EncryptedNote on block ${log.blockNumber}`);
      }

      // Filter for relayer logs
      const relayerLogs = allLogs.filter(log => 
        log.address.toLowerCase() === config.RELAYER_REGISTRY_ADDRESS.toLowerCase() && 
        log.topics[0] === relayerRegisteredTopic
      );

      // Process relayer logs
      for (const log of relayerLogs) {
        const decoded = relayerRegisteredInterface.parseLog(log);
        const { hostName, relayerAddress } = decoded.args;
        const ensName = hostName;
        const ensHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(hostName));
        const data = {
          address: relayerAddress,
          ensName,
          ensHash,
          blockRegistration: log.blockNumber
        };
        await db.insert('relayers', data);

        logger.info(`${chain} - RelayerRegistered on block ${log.blockNumber}`);
      }

      // Filter for echoer logs
      const echoerLogs = allLogs.filter(log => 
        log.address.toLowerCase() === config.ECHOER_ADDRESS.toLowerCase() && 
        log.topics[0] === echoTopic
      );

      // Process echoer logs for noteAccounts
      for (const log of echoerLogs) {
        const decoded = echoInterface.parseLog(log);
        const { who, data } = decoded.args;
        const accountIndex = (await db.getMaxNoteAccountIndex(who)) + 1;
        const noteAccountData = {
          index: accountIndex,
          address: who,
          encryptedAccount: ethers.utils.hexlify(data)
        };
        await db.insert('noteAccounts', noteAccountData);

        logger.info(`${chain} - NoteAccount on block ${log.blockNumber} for address ${who}`);
      }

      // Filter for delegated logs
      const delegationLogs = allLogs.filter(log => 
        log.address.toLowerCase() === config.GOVERNANCE_ADDRESS.toLowerCase() && 
        (log.topics[0] === delegatedTopic || log.topics[0] === undelegatedTopic)
      );

      // Process delegation logs
      for (const log of delegationLogs) {
        if (log.topics[0] === delegatedTopic) {
          const decoded = delegatedInterface.parseLog(log)
          const { account, to } = decoded.args;
          const data = {
            type: 'Delegated',
            delegator: account,
            delegatee: to,
            block: log.blockNumber,
            transactionHash: log.transactionHash
          };
          await db.insert('delegations', data);
          logger.info(`${chain} - Delegation on block ${log.blockNumber} - ${account} delegated to ${to}`);
        } 
        else if (log.topics[0] === undelegatedTopic) {
          const decoded = undelegatedInterface.parseLog(log);
          const { account, from } = decoded.args;
          const data = {
            type: 'Undelegated',
            delegator: account,
            delegatee: from,
            block: log.blockNumber,
            transactionHash: log.transactionHash
          };
          await db.insert('delegations', data);
          logger.info(`${chain} - Undelegation on block ${log.blockNumber} - ${account} undelegated from ${from}`);
        }
      }

      await db.setLastBlock(to);
      from = to + 1;
    }
    
  } catch (error) {
    logger.error(`${chain} - Error in polling:`, error);
  }
}

function formatAmount(amount) {
  const val = ethers.utils.formatEther(amount);
  // Remove trailing zeros after decimal, but keep at least one digit after decimal if needed
  if (val.indexOf('.') === -1) return val;
  // If it's like "100.0" -> "100", but "0.10" -> "0.1"
  return val.replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/, '');
}

// Update startPolling to loop over chains
async function startPolling(dbs) { // dbs is a map chain => db
  for (const chain in CHAINS) {
    await poll(chain, dbs[chain]); // Initial poll
  }
  setInterval(async () => {
    for (const chain in CHAINS) {
      await poll(chain, dbs[chain]);
    }
  }, 30000);
}

export { startPolling };
