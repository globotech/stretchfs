#!/bin/bash

if [[ '' == "$1" || 'help' == "$1" || '-h' == "$1" || '--help' == "$1" ]]; then
  echo "OOSE Instance Installation Tool"
  echo "  Note: Make sure to run the prepareDebian.sh script before continuing"
  echo "  Note: Make sure to run the installStoreDebian.sh script before continuing"
  echo
  echo "  ./prepareStoreDiskDebian.sh <oose_dir> <disk> <mount> <host>"
  echo "  eg: ./prepareStoreDiskDebian.sh /opt/oose /dev/sda /media/om101 192.168.200.2"
  echo
  exit
fi

echo "Welcome to OOSE Instance Installation Preparation"

oosedir="$1"
disk="$2"
diskRelative="$(basename $disk)"
partition="${disk}1"
mount="$3"
name=$(basename $3)
host="$4"
configFile="$mount/config.$name.js"
fstab="/etc/fstab"

if [[ '' == "$disk" ]]; then
  echo "No disk provided"
  exit
fi

if [[ '' == "$mount" ]]; then
  echo "No mount point provided"
  exit
fi

if [[ '' == "host" ]]; then
  echo "No host provided"
  exit
fi

if [ ! -e "$disk" ]; then
  echo "Disk doest not exist"
fi

echo "We are now going to wipe the disk $disk, ALL DATA WILL BE LOST!!"
read -p "Are you sure (y|n)? " -n 1 -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
  sgdisk -Z $disk
else
  echo "Aborting preparation"
  exit
fi

echo "Installing gdisk and XFS to make partitions and the FS"
apt-get -y install gdisk xfsprogs

echo "Creating partition table on $disk"
sgdisk --new=0:0:0 -t 1:8300 $disk
sgdisk -p $disk

echo "Creating file system on $partition"
mkfs.xfs -f $partition

echo -n "Obtaining $partition UUID.."
uuid="$(blkid $partition -o value | grep -)"
echo $uuid

echo -n "Adding $partition to $fstab... "
if [[ '' != $(cat $fstab | grep $uuid) ]]; then
  echo "already exists"
else
  echo "UUID=$uuid  $mount   xfs    noatime    0    0" >> $fstab
  echo "done"
fi

echo -n "Mounting $partition to $mount... "
mkdir -p $mount
mount $mount
echo "done"

echo -n "Creating folders on $mount... "
mkdir -p $mount/store
mkdir -p $mount/log
mkdir -p $mount/store/content
mkdir -p $mount/store/purchased
echo "done"

echo -n "Setting ownership permissions... "
chown -R node. $mount
echo "done"

echo -n "Creating store config on $mount for $name ($host)... "
echo "'use strict';" > $configFile
echo >> $configFile
echo "module.exports = {" >> $configFile
echo "  root: __dirname + '/store'," >> $configFile
echo "  store: {" >> $configFile
echo "    enabled: true," >> $configFile
echo "    name: '$name'," >> $configFile
echo "    host: '$host'," >> $configFile
echo "  }" >> $configFile
echo "}" >> $configFile
echo "done"

echo -n "Create $mount/dt.json for loading... "
cp $oosedir/nginx/store_dt.json $mount/dt.json
sed -i "s@OOSENAME@$name@g" $mount/dt.json
sed -i "s@OOSEDIR@$oosedir@g" $mount/dt.json
sed -i "s@OOSECONFIGFILE@$configFile@g" $mount/dt.json
sed -i "s@MOUNTDIR@$mount@g" $mount/dt.json
sed -i "s@LOGFILE@$mount/log@g" $mount/dt.json
echo "done"

echo -n "Copying files on to disk from $oosedir... "
cp -a $oosedir/nginx/html/* $mount/store/purchased
echo "done"

echo -n "Applying disk tuning to sysfs for $disk... "
echo "block/$diskRelative/queue/scheduler = deadline" >> /etc/sysfs.conf
echo "block/$diskRelative/queue/iosched/front_merges = 0" >> /etc/sysfs.conf
echo "block/$diskRelative/queue/iosched/fifo_batch = 2048" >> /etc/sysfs.conf
echo "block/$diskRelative/queue/iosched/read_expire = 250" >> /etc/sysfs.conf
echo "block/$diskRelative/queue/iosched/write_expire = 3000" >> /etc/sysfs.conf
echo "block/$diskRelative/queue/iosched/writes_starved = 10" >> /etc/sysfs.conf
echo "done"

echo "Enabling disk tuning"
/etc/init.d/sysfsutils restart

echo "Preparation complete"
echo "To start this instance run the following commands"
echo "  cd $mount"
echo "  ndt install"
echo "  ndt save"
echo "To confirm everything is operating correctly"
echo "  tail -f $mount/log/current"
echo "Enjoy!"
echo
