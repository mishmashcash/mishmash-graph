import fs from 'fs';

const logToFile = (file, message) => {
  fs.appendFileSync(file, `${new Date().toISOString()} - ${message}\n`);
};

const logger = {
  debug: (message) => {
    console.log(message);
  },
  info: (message) => {
    console.log(message);
    logToFile('logs/combined.log', `INFO: ${message}`);
  },
  error: (message, error) => {
    console.error(message, error);
    logToFile('logs/error.log', `ERROR: ${message} ${error ? JSON.stringify(error) : ''}`);
    logToFile('logs/combined.log', `ERROR: ${message} ${error ? JSON.stringify(error) : ''}`);
  }
};

export default logger;
