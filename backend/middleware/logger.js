export const logger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`📝 ${new Date().toISOString()} ${req.method} ${req.originalUrl} - ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = getStatusColor(res.statusCode);
    
    console.log(
      `📊 ${new Date().toISOString()} ${req.method} ${req.originalUrl} - ` +
      `${statusColor}${res.statusCode}\x1b[0m - ${duration}ms`
    );
  });

  next();
};

const getStatusColor = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) {
    return '\x1b[32m'; // Green
  } else if (statusCode >= 300 && statusCode < 400) {
    return '\x1b[33m'; // Yellow
  } else if (statusCode >= 400 && statusCode < 500) {
    return '\x1b[31m'; // Red
  } else {
    return '\x1b[35m'; // Magenta
  }
};

export const requestId = (req, res, next) => {
  req.id = Math.random().toString(36).substring(2, 15);
  res.setHeader('X-Request-ID', req.id);
  next();
};
