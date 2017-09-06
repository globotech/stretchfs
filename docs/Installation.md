# OOSE Installation

These instructions pertain to our production OOSE cluster and may vary. For
other installations.

## Prereqs

* NodeJS - 0.10.x
* Redis Server - 2.6.x
* MySQL - 5.6.x (master only)

## Procedure

* Checkout code to `/opt/oose`
* Create file systems and mounts for all drives in `/media/om<xxx>`
* Create a destination for the prism at `/opt/op<xxx>`
* Create `config.om<xxx>.js` files in all the media folders
* Create `config.op<xxx>.js` file in `/opt/op<xxx>`
* Create dt.json files for each instance (copy from others)
* Visit each instance folder and run `ndt install` `ndt save`
* Copy `/opt/oose/nginx/nginx.conf` to `/etc/nginx/nginx.conf` and edit
* Create folder `/etc/nginx/oose`
* Copy `/opt/oose/nginx/nginx.oose.conf` to `/etc/nginx/oose/om<xxx>.conf` and
edit
* `nginx -t` make sure it passes and `service nginx restart`

This procedure could be expanded on later to be more in depth.


## Notes

### Linux Required Steps

Enable node listening on ports < 1024

```
# setcap 'cap_net_bind_service=+ep' `which nodejs`
```
