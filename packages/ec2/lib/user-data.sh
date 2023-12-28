#!/bin/bash -ex
VERSION=v20.10.0
DISTRO=linux-x64
NODE_DIR=/usr/local/lib/nodejs
NODE_VERSION_DISTRO=node-$VERSION-$DISTRO
APP_DIR=/var/app

# install git and cloudwatch agent
dnf update -y
dnf install -y git amazon-cloudwatch-agent

# create cloudwatch config file
cat <<EOF > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "agent": {
    "run_as_user": "root"
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/app/aws-deployment-examples/packages/backend/app.log",
            "log_group_name": "aws-examples-api-logs",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 1
            "filters": [
              {
                "type": "exclude",
                "expression": "healthz"
              }
            ]
          }
        ]
      }
    }
  }
}
EOF

# start cloudwatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

# install nodejs
mkdir -p $NODE_DIR
cd $NODE_DIR
curl -sL https://nodejs.org/dist/$VERSION/$NODE_VERSION_DISTRO.tar.xz -o $NODE_VERSION_DISTRO.tar.xz
tar -xf $NODE_VERSION_DISTRO.tar.xz
echo PATH=$NODE_DIR/$NODE_VERSION_DISTRO/bin:$PATH > /etc/profile.d/nodejs_path.sh
source /etc/profile.d/nodejs_path.sh

# get aws region using IMDSv2
TOKEN=`curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300"`
REGION=`curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/placement/region`

# create cloudwatch setup and start backend
mkdir -p $APP_DIR
cd $APP_DIR
git clone https://github.com/ospatil/aws-deployment-examples.git
cd aws-deployment-examples/packages/backend
npm i
AWS_REGION=$REGION npm start
