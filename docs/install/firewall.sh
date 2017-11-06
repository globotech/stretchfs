#!/bin/bash
IPTABLES="iptables"
IP6TABLES="ip6tables"

#space separated list of allowed management sources
mgmtsrcs="199.87.232.0/24 104.221.221.0/24"
mgmt6srcs="2604:4480::c757:e800/120 2604:4480::68dd:dd00/120"

echo "Welcome to StretchFS Firewall installation tool"

pubeth="$1"
mgmtip="$2"
mgmt6ip="$3"

if [[ '' == "$pubeth" ]]; then
  echo "No interface provided"
  exit
fi

if [[ '' == "$mgmtip" ]]; then
  echo "No management IP provided"
  exit
fi
do_v6=1
if [[ '' == "$mgmt6ip" ]]; then
  echo "No management v6 IP provided. WARN: ip6tables will not be configured"
  do_v6=0
  mgmt6ip="NOT CONFIGURED"
fi

echo "Your interface is $pubeth"
echo "Your management IP is $mgmtip"
echo "Your management v6 IP is $mgmt6ip"

echo "Installing software"
apt-get -y install iptables iptables-persistent

ipt_4 () {
  $IPTABLES $*
}
ipt_6 () {
  if [[ $do_v6 ]]; then
    $IP6TABLES $*
  fi
}
ipt_both () {
  ipt_4 $*
  ipt_6 $*
}

echo -n "Flushing existing Tables... "
ipt_both -F
echo "done"

echo -n "Make sure table is accepting during work... "
ipt_both -P INPUT ACCEPT
ipt_both -P FORWARD ACCEPT
ipt_both -P OUTPUT ACCEPT
echo "done"

echo -n "Allow DNS... "
ipt_both -A INPUT -p udp -i "$pubeth" --sport 53 -j ACCEPT
echo "done"

echo -n "Allow Loopback... "
ipt_both -A INPUT -i lo -j ACCEPT
echo "done"

echo -n "Allow Inbound Ping... "
ipt_4 -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type echo-request -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type destination-unreachable -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type time-exceeded -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type parameter-problem -j ACCEPT
echo "done"

echo -n "Allow Outbound Ping... "
ipt_4 -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type echo-reply -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type router-advertisement -m hl --hl-eq 255 -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type neighbor-solicitation -m hl --hl-eq 255 -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type neighbor-advertisement -m hl --hl-eq 255 -j ACCEPT
ipt_6 -A INPUT -p icmpv6 --icmpv6-type redirect -m hl --hl-eq 255 -j ACCEPT
ipt_6 -A INPUT -p icmpv6 -j LOG --log-prefix ICMPv6
ipt_6 -A INPUT -p icmpv6 -j DROP
echo "done"

echo -n "Allow Inbound SSH on ManagementIP(s)... "
for srcip in $mgmtsrcs; do
  ipt_4 -A INPUT -i "$pubeth" -p tcp -s "$srcip" -d "$mgmtip" --dport 22 -m state --state NEW -j ACCEPT
done
ipt_4 -A INPUT -i "$pubeth" -p tcp -d "$mgmtip" --dport 22 -m state --state ESTABLISHED -j ACCEPT
for src6ip in $mgmt6srcs; do
  ipt_6 -A INPUT -i "$pubeth" -p tcp -s "$src6ip" -d "$mgmt6ip" --dport 22 -m state --state NEW -j ACCEPT
done
ipt_6 -A INPUT -i "$pubeth" -p tcp -d "$mgmt6ip" --dport 22 -m state --state ESTABLISHED -j ACCEPT
ipt_4 -A OUTPUT -o "$pubeth" -p tcp -s "$mgmtip" --sport 22 -m state --state ESTABLISHED -j ACCEPT
ipt_6 -A OUTPUT -o "$pubeth" -p tcp -s "$mgmt6ip" --sport 22 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound HTTP, HTTPS... "
ipt_both -A INPUT -i "$pubeth" -p tcp -m multiport --dports 80,443 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A OUTPUT -o "$pubeth" -p tcp -m multiport --sports 80,443 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound SSH, HTTP, HTTPS... "
ipt_both -A OUTPUT -o "$pubeth"  -p tcp -m multiport --dports 22,80,443 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A INPUT -i "$pubeth" -p tcp -m multiport --sports 22,80,443 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound StretchFS... "
ipt_both -A INPUT -i "$pubeth" -p tcp -m multiport --dports 5970,5971,5972 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A OUTPUT -o "$pubeth"  -p tcp -m multiport --sports 5970,5971,5972 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Outbound StretchFS... "
ipt_both -A OUTPUT -o "$pubeth" -p tcp -m multiport --dports 5970,5971,5972 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A INPUT -i "$pubeth" -p tcp -m multiport --sports 5970,5971,5972 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound Redis... "
ipt_both -A INPUT -i "$pubeth" -p tcp --dport 6379 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A OUTPUT -o "$pubeth"  -p tcp --sport 6379 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo -n "Allow Inbound Zabbix... "
ipt_both -A INPUT -i "$pubeth" -p tcp --dport 10050 -m state --state NEW,ESTABLISHED -j ACCEPT
ipt_both -A OUTPUT -o "$pubeth" -p tcp --sport 10050 -m state --state ESTABLISHED -j ACCEPT
echo "done"

echo
echo "Finished applying rules... printing table now"
ipt_both -nL --line-numbers -v

echo "We are now going to apply the firewall, please review the above is correct, or CONNECTION MAY BE LOST"
read -p "Are you sure (y|n)? " -n 1 -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
  ipt_both -P INPUT DROP
  ipt_both -P FORWARD DROP
  ipt_both -P OUTPUT ACCEPT
else
  echo "Aborting application"
  echo " To apply manually"
  echo "   iptables -P INPUT DROP"
  echo "   iptables -P FORWARD DROP"
  echo "   iptables -P OUTPUT ACCEPT"
  if [[ $do_v6 ]]; then
    echo "   ip6tables -P INPUT DROP"
    echo "   ip6tables -P FORWARD DROP"
    echo "   ip6tables -P OUTPUT ACCEPT"
  fi
  exit
fi

echo "StretchFS firewall installation complete"
exit
