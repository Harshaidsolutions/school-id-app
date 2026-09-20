# nginx must allow student photos (app targets ≥ 5MB per photo)
#
#   sudo nano /etc/nginx/nginx.conf
#   # inside http { ... }:
#   client_max_body_size 25M;
#
#   sudo nginx -t && sudo systemctl reload nginx
#
# Without this, uploads ≥ 5MB get HTTP 413 and never reach Node/S3/DB.
