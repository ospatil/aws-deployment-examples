#!/bin/bash
VERSION=v20.10.0
DISTRO=linux-x64
NODE_DIR=/usr/local/lib/nodejs
NODE_VERSION_DISTRO=node-$VERSION-$DISTRO
APP_DIR=/home/ec2-user/app

# install git
dnf update -y
dnf install -y git

# install nodejs
mkdir -p $NODE_DIR
cd $NODE_DIR
curl -sL https://nodejs.org/dist/$VERSION/$NODE_VERSION-DISTRO.tar.xz | tar -xz
echo PATH=$NODE_DIR/$NODE_VERSION_DISTRO/bin:$PATH > /etc/profile.d/nodejs_path.sh
source /etc/profile.d/nodejs_path.sh

# install pm2 and start backend
npm i -g pm2
mkdir -p $APP_DIR
cd $APP_DIR
chown -R ec2-user:ec2-user $APP_DIR
git clone https://github.com/ospatil/aws-deployment-examples.git
cd aws-deployment-examples/packages/backend
npm i
pm2 start "npm start"
