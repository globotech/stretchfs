#!/bin/bash
debMultiMediaAptList="/etc/apt/sources.list.d/deb-multimedia.list"
hostname=$(hostname)
hostnameDomain=$(hostname -d)
hostnameFQDN=$(hostname -f)

nginxNodeCommon=$(cat <<'NGX_CONFIG'
#let connections stay open if they want
keepalive_timeout 70;
client_max_body_size 0;

access_log off;

ssl_certificate ssl/ssl.crt;
ssl_certificate_key ssl/ssl.key;

#note we've tricked next_upstream into retrying the same backend a bunch of times
proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
#important for backend persistence and websockets
proxy_http_version 1.1;
proxy_set_header  Host $host;
proxy_set_header  X-Real-IP $remote_addr;
proxy_set_header  X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_pass_header User-Agent;

#The following may be overridden in a location block below
# ignore client disposition and keep/reuse sockets as much as possible
proxy_set_header Connection '';
# ignore websockets
proxy_set_header Upgrade '';

#remap any backend refs to something that might work
proxy_redirect http://localhost:3001/ $scheme://$host:$server_port/;
proxy_redirect http://127.0.0.1:3001/ $scheme://$host:$server_port/;

location /nginx_status {
  stub_status on;
  access_log off;
}
NGX_CONFIG
)

nginxPersistence=$(cat <<'NGX_CONFIG'
#mapping for header control and selective upgrade
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      '';
}
NGX_CONFIG
)

nginxCache=$(cat <<'NGX_CONFIG'
server_names_hash_bucket_size 64;
server_name_in_redirect off;

# setup cache
proxy_cache_path           /dev/shm/cache levels=1:2 keys_zone=web-cache:512m max_size=7000m inactive=1000m;
proxy_temp_path            /dev/shm/cache/tmp;
proxy_cache_valid          404 1m;
proxy_redirect             off;
proxy_max_temp_file_size   0;
proxy_buffer_size          4k;
proxy_buffers              64 4k;
proxy_busy_buffers_size    128k;
proxy_temp_file_write_size 128k;
proxy_connect_timeout      300;
proxy_send_timeout         300;
proxy_read_timeout         300;

#cache https handshakes etc, for faster negotiations
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
NGX_CONFIG
)

nginxSitesExport=$(cat <<NGX_CONFIG
# ${hostnameFQDN}
#define the backend
upstream node-${hostname} {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3001 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3001 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name ${hostnameFQDN};
  server_name_in_redirect on;

  include /etc/nginx/node-common.conf;

  #buffering off for bulk data service
  proxy_buffering off;

  location / {
    proxy_pass http://node-${hostname};
  }
}
NGX_CONFIG
)

nginxSitesGump=$(cat <<NGX_CONFIG
# gump.${hostnameDomain}
#define the backend
upstream node-gump {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3004 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3004 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name gump.${hostnameDomain};
  server_name_in_redirect on;

  include /etc/nginx/node-common.conf;

  location /embed {
    add_header X-Web-Cache true;
    proxy_cache_valid 200 5m;
    proxy_cache web-cache;
    proxy_pass http://node-gump;
  }

  location / {
    #bounce non SSL
    if (\$https != on) {
      return 301 https://gump.${hostnameDomain};
    }
    # allow websockets
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_pass http://node-gump;
  }
}
NGX_CONFIG
)

nginxSitesHideout=$(cat <<NGX_CONFIG
# hideout.${hostnameDomain}
#define the backend
upstream node-hideout {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3006 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3006 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name hideout.${hostnameDomain};
  server_name_in_redirect on;

  include /etc/nginx/node-common.conf;

  location / {
    proxy_pass http://node-hideout;
  }
}
NGX_CONFIG
)

nginxSitesLg=$(cat <<NGX_CONFIG
# lg.${hostnameDomain}
#define the backend
upstream node-lg {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3005 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3005 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name lg.${hostnameDomain};
  server_name_in_redirect on;

  include /etc/nginx/node-common.conf;

  #bounce non SSL
  if (\$https != on) {
    return 301 https://lg.${hostnameDomain};
  }

  location / {
    # allow websockets
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_pass http://node-lg;
  }
}
NGX_CONFIG
)

nginxSitesPrism=$(cat <<NGX_CONFIG
# prism.${hostnameDomain}
#define the backend
upstream node-prism {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3003 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3003 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name ${hostnameDomain} prism.${hostnameDomain};

  include /etc/nginx/node-common.conf;

  location / {
    proxy_pass http://node-prism;
  }
}
NGX_CONFIG
)

nginxSitesExecutioner=$(cat <<NGX_CONFIG
# executioner.${hostnameDomain}
#define the backend
upstream node-executioner {
  #same target both lines, this is to sort of fool the next_upstream into retrying a few times
  server 127.0.0.1:3007 max_fails=5 fail_timeout=5s;
  server 127.0.0.1:3007 backup max_fails=5 fail_timeout=30s;
  #keep these many sockets alive to the backend at any time
  keepalive 32;
}

server {
  listen 80;
  listen 443 ssl;
  server_name executioner.${hostnameDomain};

  include /etc/nginx/node-common.conf;

  location / {
    proxy_pass http://node-executioner;
  }
}
NGX_CONFIG
)

function banner {
  line=$(echo $1 | tr [:print:] [-*])
  echo
  echo ${line}
  echo "$1"
  echo ${line}
}

function runCommand {
  banner "$1"
  $1
}

function userExists {
  if id -u $1 >/dev/null 2>&1; then
    echo 1
  else
    echo 0
  fi
}

function catDebFile {
  pkgname="$1"
  file="$2"
  debfile="/var/cache/apt/archives/$(dpkg -l ${pkgname} | grep "^ii " | \
    sed -e"s/^ii.*\(${pkgname}\) *\([0-9][^ ]*\) *\([^ ]*\) .*$/\1_\2_\3.deb/")"
  [ -f "${debfile}" ] && dpkg --fsys-tarfile ${debfile} | tar xfO - ".${file}"
}

banner "Preparing Peer for StrechFS installation"
echo

# start running commands
runCommand "apt-get -q -y update"
runCommand "apt-get -q -y upgrade"
runCommand "apt-get -q -y install gcc g++ make git redis-server dstat vim screen snmpd mongodb nodejs nodejs-legacy wget curl ntp nginx"

if [ $(userExists node) -eq 0 ]; then
  banner "Creating user node"
  runCommand "adduser --disabled-password --shell=/bin/bash node"
fi

banner "Ensuring user file open limits"
limitsSet=0
# setup pam session common if we have to
if [[ $(grep "pam_limits.so" /etc/pam.d/common-session) == "" ]]; then
  limitSet=1
  sed -i "/# end of pam-auth-update config/a \
session required pam_limits.so\n" /etc/pam.d/common-session
fi

# setup security limits if not already
limitfile="/etc/security/limits.d/node.conf"
if [[ $(grep -e "node\s+soft" ${limitfile}) == "" ]]; then
  limitSet=2
  echo "root            soft    nofile          262144\n\
root            hard    nofile          524288\n\
node            soft    nofile          262144\n\
node            hard    nofile          524288\n\
" > ${limitfile}
fi

# run some sanity commands
mkdir -p /var/log/node/stretchfs > /dev/null 2>&1
chown -R node:node /var/log/node  > /dev/null 2>&1

# setup nginx
if [ ! -f "/etc/nginx/node-common.conf" ]; then
  banner "Configuring Nginx"
  catDebFile nginx-common /etc/nginx/nginx.conf | sed \
    -e"s/\(user\) .*$/\1 node;/" \
    -e"s/\(worker_processes\) .*$/\1 17;/" \
    -e"s/\(worker_connections\) .*$/\1 32768;/" \
    -e"s/# \(multi_accept\)/\1/" \
    -e"s/\(multi_accept\) .*$/\1 off;/" > /etc/nginx/nginx.conf
  echo "$nginxNodeCommon" > /etc/nginx/node-common.conf
  echo "$nginxPersistence" > /etc/nginx/conf.d/persistence.conf
  rm -f /etc/nginx/conf.d/sslcache.conf #deprecated
  echo "$nginxCache" > /etc/nginx/conf.d/cache.conf
  export="sites-available/export.${hostnameDomain}"
  gump="sites-available/gump.${hostnameDomain}"
  hideout="sites-available/hideout.${hostnameDomain}"
  lg="sites-available/lg.${hostnameDomain}"
  prism="sites-available/prism.${hostnameDomain}"
  executioner="sites-available/executioner.${hostnameDomain}"
  echo "$nginxSitesExport" > /etc/nginx/${export}
  echo "$nginxSitesGump" > /etc/nginx/${gump}
  echo "$nginxSitesHideout" > /etc/nginx/${hideout}
  echo "$nginxSitesLg" > /etc/nginx/${lg}
  echo "$nginxSitesPrism" > /etc/nginx/${prism}
  echo "$nginxSitesExecutioner" > /etc/nginx/${executioner}
  #make this part smarter / grok config[.local].js for actual enableds
  rm -rf /etc/nginx/sites-enabled/*
  cd /etc/nginx/sites-enabled
  ln -s ../${export}
  ln -s ../${gump}
  ln -s ../${hideout}
  ln -s ../${lg}
  ln -s ../${prism}
  ln -s ../${executioner}
  nginx -t
  if [ $? -gt 0 ]; then
    echo "Nginx configuration test failed"
    exit 1
  fi
fi
runCommand "/etc/init.d/nginx restart"

# install npm
if [[ "$(which npm)" == "" ]]; then
  banner "Installing NPM"
  curl -s -L "https://npmjs.org/install.sh" > /tmp/npminstall.sh
  /bin/bash /tmp/npminstall.sh 2> /dev/null
  rcode="$?"
  rm -f /tmp/npminstall.sh
  if [ "${rcode}" -gt 0 ]; then
    echo "Failed to install NPM"
    exit ${rcode}
  fi
fi

if [[ "$(which pm2)" != "" ]]; then
  banner "Fuck PM2!!!!!!"
  runCommand "pm2 -s --no-color flush"
  runCommand "pm2 -s --no-color kill"
  npm config set color false
  runCommand "npm -q --no-spin -g uninstall pm2"
fi

if [[ "$(dpkg -l | grep daemontools)" == "" ]]; then
  banner "Installing daemontools"
  runCommand "apt-get -q -y install daemontools-run"
  runCommand "init q"
fi

# install ffmpeg?
if [[ "$(which ffmpeg)" == "" ]]; then
  banner "Installing FFMPEG"

  banner "Adding Deb Multimedia"
  echo "deb http://www.deb-multimedia.org wheezy main non-free" > /etc/apt/sources.list.d/deb-multimedia.list
  apt-get -q -y update
  apt-get -q -y --force-yes install deb-multimedia-keyring
  apt-get -q -y update

  runCommand "apt-get -q -y install ffmpeg gpac flvmeta flvtool2"
fi

# upgrade the snmp conf
if [[ "$(grep .1.3.6.1.2.1.31 /etc/snmp/snmpd.conf)" == "" ]]; then
  banner "Configuring SNMP"
  #kill stupid logging and enable service
  sed -i -e"s/^\(SNMPDOPTS='\)-Lsd /\1/" \
   -e"s/^\(TRAPDOPTS='\)-Lsd/\1-Lf\ \/dev\/null/" \
   -e"s/^\(SNMPDRUN=\).*$/\1yes/" /etc/default/snmpd
  sed -i "/view   systemonly  included   .1.3.6.1.2.1.25.1/d" /etc/snmp/snmpd.conf
  # bad tabbing is intentional for the config file to look right
  sed -i "/view   systemonly  included   .1.3.6.1.2.1.1/a \
view   systemonly  included   .1.3.6.1.2.1.2\n\
view   systemonly  included   .1.3.6.1.2.1.4\n\
view   systemonly  included   .1.3.6.1.2.1.25\n\
view   systemonly  included   .1.3.6.1.2.1.31\n\
view   systemonly  included   .1.3.6.1.4.1\n" /etc/snmp/snmpd.conf
  /etc/init.d/snmpd restart
fi

banner "Preparation Complete"
exit 0
