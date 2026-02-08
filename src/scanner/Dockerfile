# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Set working directory
WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Install Playwright browsers
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copy source code and TypeScript configuration
COPY scanner.ts tsconfig.json ./

# Install TypeScript globally and build
RUN npm install -g typescript && npm run build

# Create non-root user for security
RUN groupadd -r scanner && useradd -r -g scanner scanner
RUN chown -R scanner:scanner /app
USER scanner

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Scanner container is running')" || exit 1

# Command to run the scanner (will be overridden by Lambda with environment variables)
CMD ["node", "dist/scanner.js"]
