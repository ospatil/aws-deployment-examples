#!/bin/bash
VERSION=v20.10.0
DISTRO=linux-x64
NODE_DIR=/usr/local/lib/nodejs
NODE_VERSION_DISTRO=node-$VERSION-$DISTRO

# install git
dnf update -y
dnf install -y git

# install nodejs
mkdir -p $NODE_DIR
cd $NODE_DIR
curl -sL https://nodejs.org/dist/$VERSION/$NODE_VERSION-DISTRO.tar.xz | tar -xz
echo PATH=$NODE_DIR/$NODE_VERSION_DISTRO/bin:$PATH > /etc/profile.d/node-path.sh

source /etc/profile.d/node-path.sh

npm i -g pm2
