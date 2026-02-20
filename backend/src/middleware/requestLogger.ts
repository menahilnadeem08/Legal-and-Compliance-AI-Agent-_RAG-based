import morgan from 'morgan';
import logger from '../utils/logger';

// Create a stream object with a 'write' function that will be used by `morgan`
const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Create the morgan middleware
const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream }
);

export default requestLogger;
