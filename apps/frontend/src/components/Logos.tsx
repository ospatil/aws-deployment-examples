import apigatewayLogo from '../assets/apigateway.svg'
import cloudfrontLogo from '../assets/cloudfront.svg'
import cognitoLogo from '../assets/cognito.svg'
import ec2Logo from '../assets/ec2.svg'
import ecsLogo from '../assets/ecs.svg'
import eksLogo from '../assets/eks.svg'
import elbLogo from '../assets/elb.svg'
import lambdaLogo from '../assets/lambda.svg'
import s3Logo from '../assets/s3.svg'

export default function Logos() {
  return (
    <div class="grid grid-cols-9">
      <img src={ec2Logo} alt="EC2" class="h-12" />
      <img src={lambdaLogo} alt="Lambda" class="h-12" />
      <img src={s3Logo} alt="S3" class="h-12" />
      <img src={elbLogo} alt="ELB" class="h-12" />
      <img src={cloudfrontLogo} alt="Cloudfront" class="h-12" />
      <img src={apigatewayLogo} alt="API Gateway" class="h-12" />
      <img src={cognitoLogo} alt="Cognito" class="h-12" />
      <img src={ecsLogo} alt="ECS" class="h-12" />
      <img src={eksLogo} alt="EKS" class="h-12" />
    </div>
  )
}
