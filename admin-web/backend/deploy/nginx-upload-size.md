# nginx must allow student photos (app targets ≥ 5MB per photo)
#
#   sudo nano /etc/nginx/nginx.conf
#   # inside http { ... }:
#   client_max_body_size 25M;
#
#   sudo nginx -t && sudo systemctl reload nginx
#
# Without this, uploads ≥ 5MB get HTTP 413 and never reach Node/S3/DB.
#
# ID Card Generator (CMYK export uploads whole print PDFs; PDF templates):
# add inside the existing HTTPS server block, before the general /api location,
# using the same backend port as the rest of the site:
#
#   location /api/admin/id-generator/ {
#       client_max_body_size 600M;
#       proxy_read_timeout 1800s;
#       proxy_send_timeout 1800s;
#       proxy_pass http://127.0.0.1:5000;
#       proxy_set_header Host $host;
#       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#       proxy_set_header X-Forwarded-Proto $scheme;
#   }
#
#   sudo nginx -t && sudo systemctl reload nginx
