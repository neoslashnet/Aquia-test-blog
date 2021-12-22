---
title: "Finding security issues and misconfigurations in AWS Cloud Development Kit projects with SemGrep"
date: 2021-12-21T09:38:03+10:00
layout: post
authors: ["Dakota Riley"]
categories: ["Security", "AWS", "IaC"]
#tags: ["Security"]
description: Learn how to find security issues and misconfigurations in AWS Cloud Development Kit projects with SemGrep.
thumbnail: "assets/images/codeexample.jpg"
image: "https://source.unsplash.com/HakTxidk36I/1600x900"
---

# Intro

Many teams today are taking advantage of Infrastructure-As-Code (IaC) and its numerous benefits, not only from the automation perspective but also from the security perspective. Due to the declarative nature of IaC formats like CloudFormation, Terraform, or Kubernetes manifests (which are espressed in JSON, Yaml or in the case of TF - Hashicorp Configuration Language), Static Code Analysis is a reliable technique to automatically identify security misconfigurations in IaC that has seen a boom of tools released in the last few years.

A recent trend in the IaC landscape is the emergence of IaC frameworks that utilize true programming languages (think Python, Javascript/Typescript, etc) to define infrastructure instead of data expression languages like JSON or YAML. Two such examples of this are the AWS Cloud Development Kit and Pulumi. These frameworks provide all the features of a turing complete programming language, but still offer declarative style resource definitions (see constructs below).

In this blog - we will explore applying Static Code Analysis with Semgrep to the AWS Cloud Development Kit to find security misconfigurations.

# What is the AWS CDK?

The AWS Cloud Development Kit (CDK) is an IaC framework that allows you to define your cloud resources with familiar programming languages and an object oriented approach.

The CDK uses a concept refered to as constructs - which represent AWS resources. AWS CDK constructs come in two flavors: L1 constructs - which map 1:1 with AWS Cloudformation resources, and L2 constructs - which provide higher-level, intent based interfaces. See the following example where we create an S3 Bucket using the AWS CDK L2 Bucket Contruct:

```typescript
import * as s3 from "@aws-cdk/aws-s3";
import * as cdk from "@aws-cdk/core";

export class CdkStarterStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "s3-bucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
  }
}
```

L2 Constructs, in my opinion, are one of the biggest value propositions of the AWS CDK. They often take something that would require coordinating multiple cloudformation resources, and condense them into an easy to reason about package. Another great example of this is the AWS CDKs L2 VPC Construct. For those familiar with AWS - you are likely aware that a VPC consists of several moving parts in order to actually work: The VPC itself, Subnets, Route Tables, any associated Internet/NAT Gateways, etc. In raw Cloudformation - these would all have to be explicitly expressed. With the AWS CDK - this is a single entity, but still configurable via parameters/methods:

```typescript
import * as ec2 from "@aws-cdk/aws-ec2";
import * as cdk from "@aws-cdk/core";

export class CdkStarterStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "VPC", {
      cidr: "10.0.0.0/21",
      maxAzs: 1,
    });
  }
}
```

This would actually produce a VPC with multiple public and private subnets (those also can be configured, check out the documentation for the vpc construct here). The AWS CDK construct library is designed to reduce the "cognitive lift" required for a developer to build AWS Infrastructure via IaC. There are numerous other benefits (static typing, intellisense/autocomplete), but those go beyond the scope of this article.

# What is Semgrep?

Semgrep (short for Semantic Grep), is a fast, lightweight, and open-source static analysis tool for finding bugs and automating code reviews. Semgrep can be ran locally via IDE, in CI, or externally against codebases. One of the biggest benefits of Semgrep is its highly accessible custom rule system - most other tools that expose this either a) require deep working knowledge of how an Abstract Syntax Tree works, b) learning a custom DSL, or c) both! With Semgrep - the rules look almost exactly like the code you want to find - so if you can code, you can write rules!

For a quick example of how Semgrep works - take the following slightly fun/hypothetical python code snippet:

```python
from doomsday import start_skynet

def main():
    print('Simulating what would happen if we started Skynet')
    start_skynet(simulation=True)

    print('Actually starting Skynet')
    start_skynet()
```

In the above example - we want to enforce that engineers dont execute the start_skynet() function without the `simulation=True` parameter, for obvious bad reasons. Because we know Python, and know what the bad code in question looks like - we can develop the following rule:

```yaml
rules:
  - id: skynet_started
    patterns:
      - pattern: start_skynet(...)
      - pattern-not: start_skynet(..., simulation=True, ...)
    message: You are starting skynet! Do you actually want to end the world? Add simulation=True parameter
    languages: [python]
    severity: ERROR
```

The rule above would find the bad implementations we are looking for:

```bash
dakota@Dakotas-MBP scratch % semgrep --config rule.yml
Running 1 rules...
skynet.py
rule:skynet_started: You are starting skynet! Do you actually want to end the world? Add simulation=True parameter
8:    start_skynet()
ran 1 rules on 1 files: 1 findings
```

This example is really just scratching the surface of Semgreps capabilities - and for those already familiar with static analysis - Semgrep is "code aware", meaning that it goes beyond pattern matching and supports features like constant propagation, import aliases, and metavariables (think capture groups). See [here](https://semgrep.dev/docs/writing-rules/pattern-syntax/#pattern-matching) for a list of features.

# Why apply static analysis to the AWS CDK?

Now - why would we apply Static Analysis directly to the AWS CDK? Because the AWS CDK ultimately synthesizes AWS Cloudformation - a known pattern is just to synthesize the templates and then pass them to a tool that understands cloudformation (CfnGuard, Checkov, cfn-nag, Snyk IaC are among many available tools that exist for this). A couple thoughts to this point:

- **Speaking the language of the developers**. At a previous company I worked at, we had alot of development teams whom their first foray into the world of IaC was with the AWS CDK - and as a result, most didn't really know or care about the underlying Cloudformation that was produced. We (as a security team) found we had alot more traction in resolving issues at the IaC level when we addressed how to fix them in the AWS CDK project itself, as opposed to just yelling about a Cloudformation level issue. Anything we can do to make security issues easier to fix (and make development teams happy - is a huge plus). In a way (while not quite as complex) - we could liken the CDK to a compiler that outputs Cloudformation. We wouldn't yell at developers about assembly-level issues, right? We would address them at the code level. Same concept applies with the CDK.

- **Taking advantage of the CDKs powerful abstractions**. Given the AWS CDKs powerful but readable abstractions over AWS resources - there are actually cases where we might be able to identify security issues easier in some cases (See the example of Bucket above where we are setting Encryption and EnforceSSL on the Bucket construct).

- Lastly, just to experiment and see if we can produce better security outcomes instead of just sticking with the "tried and true!". This blog is about exploring if this is a feasible approach.

At the time of writing - we were unable to find any tooling that performs Static Code Analysis directly against the AWS CDK. [CDK-Nag](https://github.com/cdklabs/cdk-nag) is another awesome security tool for the AWS CDK, but it operates almost as more of "runtime" check - requiring you to run `cdk synth` to get results (which requires a buildable enviorment). In addition - CDK-Nag actually "walks" the construct tree of the stack - reading the underlying Cloudformation level settings of a construct, as opposed to directly looking at the code of the L2 Construct itself - so it is a different approach then we are taking here.

# Writing Semgrep rules to find AWS CDK Security Issues

Going through this process - the first step of writing a Semgrep rule is to know what bad things we want to look for, and what the code for these things looks like. We will cover two specific classes of issues related to the CDK:

- Specific misconfigurations with the AWS Construct Library L2 Constructs
- Enforcing that your team utilizes a custom construct with secure defaults as opposed to the out of the box one.

## CDK high level construct misconfigurations

Diving into the first class of issues - I actually came up with a list of 5 common security issues I wanted to hunt for with L2 Constructs (You can actually find all of in them in the Semgrep Registry [here](https://semgrep.dev/r?q=aws.cdk) and the PR merging them in [here](https://github.com/returntocorp/semgrep-rules/pull/1629)):

- CodeBuild Project constructs with the `Badge: true` (Will make the project public)
- S3 Bucket contructs lacking an `Encryption` property with a valid setting (Will create a Bucket without default encryption enabled)
- S3 Bucket constructs lacking the `EnforceSSL: true` property (Will create the bucket without adding a statement to enforce encryption in transit to the bucket policy)
- Calling the `GrantPublicAccess()` method on Bucket Contructs (Will make the bucket publically accessible)
- SQS Queue constructs lacking an `Encryption` property with a valid setting (Will create an SQS Queue without encryption at rest enabled)

> \***\*NOTE:\*\*** If you are wanting to follow along the steps here - you can either [download the Semgrep CLI](https://semgrep.dev/docs/getting-started/) tool and run locally, or make use of the [Semgrep Playground](https://semgrep.dev/editor), which provides everything you need in browser to build and test semgrep rules

For the purpose of keeping the blog concise - we will run though the process of developing a rule for the Calling the `GrantPublicAccess()` method on Bucket Contructs issue. Going back to my initial statement, we now need to know what good code, and bad code looks like in this case (Almost taking a Test Driven Development approach here - starting with what we want to find then coding from that). First, lets create a rule template with basic things like rule-id and metadata:

```yaml
rules:
  - id: awscdk-bucket-grantpublicaccessmethod
    patterns: #purposely blank - for now
    message: Using the GrantPublicAccess method on bucket contruct $X will make the objects in the bucket world accessible. Verify if this is intentional.
    languages: [ts]
    severity: WARNING
    metadata:
      cwe: "CWE-306: Missing Authentication for Critical Function"
      category: security
      technology:
        - AWS-CDK
      references:
        - https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-overview.html
```

Semgrep rules are defined in YAML files - which will contain the id, pattern, message presented for the finding, and other metadata type fields with additional info about the security issue we are trying to capture, which will be super helpful for the people responible for actually fixing said finding. You will notice that the pattern field is actually empty - we will come back to this later. Now, we can write the code for a true positive and true negative occurance of this issue:

```typescript
import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";

export class CdkStarterStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ruleid:awscdk-bucket-grantpublicaccessmethod
    const publicBucket1 = new s3.Bucket(this, "bucket");
    console.log("something unrelated");
    publicBucket1.grantPublicAccess();

    // ok:awscdk-bucket-grantpublicaccessmethod
    const nonPublicBucket = new s3.Bucket(this, "bucket");
  }
}
```

In the code snippet above - we create two buckets (`publicBucket1` and `nonPublicBucket`), and then call the `grantPublicAccess()` method on the first bucket, making it publically accessible. In addition - note the comments above both snippets of code on lines 9 and 13 respectively - `// ruleid:...` and `// ok:...`. Semgrep has a rule testing functionality that allows us to effectively write unit tests for our rules, and it works by simply writing code that you would (and also would not) expect to produce a finding by appending the `// ruleid:YOURRULEID` or `// ok:YOURRULEID` comments above the snippets of code in question.. Then we can use either the Semgrep CLIs `--test` functionality, or the Semgrep playground to make sure our Rule behaves as expected while we develop it. Check out the docs for [testing rules in Semgrep](https://semgrep.dev/docs/writing-rules/testing-rules/) for more infromation. Now that we have both a true positive and true negative scenario. We can finally begin to develop our rule!

Going back to the `patterns` key in our rule file that we left blank earlier - this is where we will actually begin to write our rule. A quick primer on patterns:

- A "pattern" in semgrep is literally just the code you want to find, with some added capability:
  - the ellipsis operator `...` is used to match any argument, statement, parameter, etc. This is great for when we dont know or care what a particular piece of code will look like. Eg - a function called where we dont care about the presence of arguments, but still want to match if there are arugments provided.
  - Semgrep supports metavariables (these are expressed with the `$` character, like `$X` or `$VALUE`) - which are very useful if we want keep track of a particular value and see if it is used later. A great example of this would matching a variable/constant created from a certain function call and seeing if we call a particular method (We will definetly need this for our rule)
- Semgrep rule files support different types of pattern statements, which allow us to chain multiple patterns using logic to achieve our desired result, a few examples:
  - `pattern` - this just contains a single pattern as referenced above
  - `patterns` - Acts as a logical AND operation - meaning all patterns contained must match to produce a finding
  - `pattern-either` - Acts as a logical OR opereation - meaning one of the patterns contained must match to produce a finding
  - `pattern-not` - Eliminates a pattern from being a finding if matched
  - `pattern-inside` and `pattern-not-inside` -
- Pattern statements can be nested, and a rule file is at a minimum required to have at least a `pattern`, `patterns`, `pattern-either`, or the not mentioned `pattern-regex` in order to be a valid rule. Important to keep in mind while you can get incredibly complex logic with nesting - it will effect the performance of the rule.

I kept the primer limited to what we may deal with while writing the rule - but we are only scratching the surface of Semgreps capabilities - check out both the [pattern syntax](https://semgrep.dev/docs/writing-rules/pattern-syntax/) and [rule syntax](https://semgrep.dev/docs/writing-rules/rule-syntax/) for deeper information.

To begin breaking start writing our rule - we can break it up into a few pieces: - The code imports the @aws-cdk/aws-s3 module - We instantiate a `Bucket` contruct - We call the `grantPublicAccess()` method on that construct later in the code

All of the above things are necessary for a match (Logical AND) - so we can list them as multiple patterns under a `patterns` key. We can verify that we are indeed importing the @aws-cdk/aws-s3 module using the `pattern-inside` key:

```yaml
- patterns:
  - pattern-inside: |
    import * as $Y from '@aws-cdk/aws-s3'
    ...
```

So the above pattern is actually a workaround - for other languages, the pattern matching for the import statement isnt needed if you specify the full path of the module, but is a work in progress for Javascript/Typescript. See this [Issue](https://github.com/returntocorp/semgrep/issues/3745) for more info. What we are doing as a stopgap is - capturing the the import alias of the `@aws-cdk/aws-s3` module in the `$Y` metvariable, so we can reference it in our pattern. Then the ellipsis operator will match any code following the import statement.

Now, we can utilize a single pattern to catch the bucket instantiation and method call:

```yaml
- patterns:
    - pattern-inside: |
        import * as $Y from '@aws-cdk/aws-s3'
        ...
    - pattern: |
        const $X = new $Y.Bucket(...)
        ...
        $X.grantPublicAccess(...)
```

On the first line of the pattern we just added - notice we are using `$X` to capture the variable name of the Bucket, and `$Y` to match the import alias/name we captured earlier. We then use the ellipsis operator to match any code the user may (or may not) insert between the first line and the last line in the pattern. Finally - we reference the `$X` metavariable we captured to match someone calling the `grantPublicAccess()` method, with the ellipsis operator in place of the arguments to cover the case if someone passes arguments to it, or leaves it blank. Adding the above to our final rule - we get the following:

```yaml
rules:
  - id: awscdk-bucket-grantpublicaccessmethod
    patterns:
      - pattern-inside: |
          import * as $Y from '@aws-cdk/aws-s3'
          ...
      - pattern: |
          const $X = new $Y.Bucket(...)
          ...
          $X.grantPublicAccess(...)
    message: Using the GrantPublicAccess method on bucket contruct $X will make the objects in the bucket world accessible.
      Verify if this is intentional.
    languages: [ts]
    severity: WARNING
    metadata:
      cwe: "CWE-306: Missing Authentication for Critical Function"
      category: security
      technology:
        - AWS-CDK
      references:
        - https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-overview.html
```

Execute the rule using either the Semgrep Playground (See the finished rule [here](https://semgrep.dev/s/AyyL)) or Semgrep CLI:

```bash
dakota@Dakotas-MBP semgrep % semgrep --quiet --test
1 yaml files tested
check id scoring:
--------------------------------------------------------------------------------
(TODO: 0) bucketpublic.yaml
	✔ awscdk-bucket-grantpublicaccessmethod                        TP: 1 TN: 1 FP: 0 FN: 0
--------------------------------------------------------------------------------
final confusion matrix: TP: 1 TN: 1 FP: 0 FN: 0
--------------------------------------------------------------------------------
```

## Secure defaults by enforcing usage of custom constructs

The second "category" of issue I wanted to cover in this blog is enforcing best practices/team standards via custom constructs - and writing Semgrep rules to ensure these are used. The AWS CDK allows you to author custom contructs - which are analgous to modules in other IaC frameworks. It is not uncommon for companies or teams to create "Secure by default" modules for IaC - and interestingly enough Semgrep actually mentions this (to all code, not just IaC) in its use cases: "Create and enforce code guardrails". To give a practical example - lets say that the lead software engineer of the team has developed a construct called `SecureBucket` - which encapsulates a number of secure defaults over the base Bucket contruct:

```typescript
import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";

export class SecureBucket extends s3.Bucket {
  constructor(scope: cdk.Construct, id: string, props?: s3.BucketProps) {
    super(scope, id, {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      serverAccessLogsBucket: s3.Bucket.fromBucketName(scope, "LoggingBucket", "AccountLoggingbucket"),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
  }
}
```

The team now wants to ensure that the `SecureBucket` construct is used in their codebase instead of the `Bucket` construct to enforce that Bucket Encryption at Rest, Encryption in Transit, Logging, and Public Access Block are all enabled without having to think about it. We can achieve this with a simplistic Semgrep rule - as in this case we really only care about finding all usages of the `Bucket` contruct. Keeping with our spirit of working backwards from the known bad code - lets write some code of what we do and dont wish to find with our rule:

```typescript
import * as s3 from "@aws-cdk/aws-s3";
import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as secureConstructs from "./secureContructs";

export class CdkStarterStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ruleid:awscdk-use-secure-bucket
    const bucket = new s3.Bucket(this, "s3-bucket");

    // ok:awscdk-use-secure-bucket
    const secureBucket = secureConstructs.SecureBucket(this, "");

    // ok:awscdk-use-secure-bucket
    const vpc = new ec2.Vpc(this, "Vpc");
  }
}
```

Since we covered the rulewriting and testing capability of Semgrep above - we will keep it brief. We need our rule to detect the usage of the `s3.Bucket` construct, and not alert on the true negative cases (One where we are actually using the secureBucket construct, the other where we are instantiating a different resource altogether). Given that we are simply looking for direct usage of the Bucket construct and recommending using our wrapper instead (so we dont have to comment on a pull request), we can actually just lightly modify our previous rule by removing a line from the pattern;

```yaml
rules:
  - id: awscdk-use-secure-bucket
    patterns:
      - pattern: const $X = new $Y.Bucket(...)
      - pattern-inside: |
          import * as $Y from '@aws-cdk/aws-s3'
          ...
    message: |
      Construct $X is using the standard Bucket construct - use the SecureConstruct.SecureBucket wrapper construct instead
    languages: [ts]
    severity: WARNING
```

Check out the live example in the Semgrep Playground [here](https://semgrep.dev/s/7nne)!

## Helpful Links and Additional Reading

- [AWS Cloud Development Kit](https://aws.amazon.com/cdk)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/v1/docs/aws-construct-library.html)
- [AWS CDK Workshop](https://cdkworkshop.com)
- [Pulumi](https://www.pulumi.com)
- [Semgrep](https://semgrep.dev)
- [First Rule Example - Semgrep Playground](https://semgrep.dev/s/AyyL)
- [Second Rule Example - Semgrep Playground](https://semgrep.dev/s/7nne)
