FROM mhart/alpine-node:7

WORKDIR /app
ADD package.json .
RUN npm install --production
ADD . .

ENV COMPONENT_NAME="permissions-maintenance" 
ENV PORT=3000
EXPOSE 3000
CMD ["node", "permissions-maintenance.js"]