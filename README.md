# MishMash GraphQL Service

## Overview

This application is a GraphQL subgraph for the MishMash protocol on Electroneum blockchain networks (mainnet and testnet). It polls blockchain events from specific smart contracts, including deposits, withdrawals, relayer registrations, encrypted notes, and note accounts. The data is stored in local NeDB databases and exposed through a GraphQL API for querying.

Key components:
- **Indexer**: Periodically fetches and processes blockchain logs for relevant events.
- **Database**: Uses NeDB to store indexed data separately for each chain.
- **GraphQL Server**: Built with Apollo Server and Express, providing queries for the indexed data.
- **Rate Limiting**: Includes IP-based rate limiting and temporary banning to prevent abuse.

The server runs on port 4000, with chain-specific endpoints (e.g., `/graphql/mainnet`, `/graphql/testnet`).

## Prerequisites

- Node.js (version 14 or higher recommended)
- Yarn package manager
- RPC URLs for Electroneum mainnet and testnet

## Installation

1. Clone the repository and navigate to the project directory.

2. Install dependencies:
   ```
   yarn install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   MAINNET_RPC_URL=https://your-mainnet-rpc-url
   TESTNET_RPC_URL=https://your-testnet-rpc-url
   ```

## Running the Application

1. Start the server:
   ```
   yarn start
   ```
   Alternatively:
   ```
   node index.js
   ```

2. The server will start on port 4000. You can access the GraphQL playground at:
   - Mainnet: http://localhost:4000/graphql/mainnet
   - Testnet: http://localhost:4000/graphql/testnet

## Building

To create a zip archive of the project (e.g., for deployment):
```
./build.sh
```
This will generate `graph.zip`.

## Data Storage

Indexed data is stored in the `./data` directory, with subdirectories for each chain (mainnet and testnet). Each chain has separate NeDB files for deposits, withdrawals, relayers, encrypted notes, note accounts, and metadata.

## Logging

Logs are written to:
- `logs/combined.log`: All info and error logs
- `logs/error.log`: Error logs only

## Queries

Example GraphQL queries can be tested in the Apollo playground. Available queries include:
- `deposits`
- `withdrawals`
- `relayers`
- `encryptedNotes`
- `noteAccounts`
- `_meta` (for last indexed block)

For detailed schema, refer to `schema.js`.

## Notes

- The indexer polls every 30 seconds.
- Initial indexing may take time depending on the chain's block height.
- Ensure RPC URLs are valid and have sufficient rate limits for polling.
