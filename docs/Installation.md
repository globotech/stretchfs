# StretchFS Installation

These instructions pertain to our production StretchFS cluster and may vary. For
other installations.

## Prereqs

* NodeJS - 8.x+ (NPM 5.4+)
* Redis Server - 2.6+
* Coucbase Server - 4.5.+

## Procedure

* Checkout code to `/opt/stretchfs`
* Create file systems and mounts for all drives in `/media/om<xxx>`
* Create a destination for the prism at `/opt/op<xxx>`
* Create `config.om<xxx>.js` files in all the media folders
* Create `config.op<xxx>.js` file in `/opt/op<xxx>`
* Create dt.json files for each instance (copy from others)
* Visit each instance folder and run `ndt install` `ndt save`

This procedure could be expanded on later to be more in depth.


## Notes

### Linux Required Steps

Enable node listening on ports < 1024

```
# setcap 'cap_net_bind_service=+ep' `which nodejs`
```
