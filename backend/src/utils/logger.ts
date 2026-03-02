import winston from "winston";

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  const env = process.env.NODE_ENV || "development";
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "http";
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""
        }`;
    }
  )
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    silent: process.env.NODE_ENV === "test" || process.env.NODE_ENV === "testing",
  }),
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: "logs/combined.log",
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

const Logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

export default Logger;
