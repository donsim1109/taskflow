FROM nginx:alpine

# Copy static files into nginx's serve directory
COPY . /usr/share/nginx/html

# Copy custom nginx config that respects Railway's $PORT
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
