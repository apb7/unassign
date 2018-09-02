# Unassign
> A GitHub App built with Probot which automatically pings and unassigns contributors based on their response to an issue already assigned to them.

![](https://user-images.githubusercontent.com/24826041/44961045-e4158100-af27-11e8-8e94-972e6b0cd0d8.png)

This app has been inspired by and built upon [stale](https://github.com/probot/stale), another awesome GitHub App built with Probot that closes abandoned Issues and Pull Requests after a period of inactivity.

## Use Case
In almost all organizations, contributors are assigned specific issues before they start working on a fix so that no two contributors end up working on the same issue. The maintainers of the project then need to keep an eye on all assigned issues and ping the assignee in case of no response. After a certain time, the maintainers need to unassign all such contributors who have not shown sufficient response, from the issue so that others can pick it up.  
The unassign bot does exactly the same thing - it pings the assignee of each assigned issue after a certain number of specified days, if there has been no response and unassigns the contributor if no further activity occurs post the initial ping, as specified in the environment configuration file.

## Configuration
The bot can easily be configured by setting the following environment variables locally or on a server:  
```
PERFORM=true  
DAYS_UNTIL_NO_RESPONSE=7  
DAYS_UNTIL_UNASSIGN=10  
```

Please refer to the [sample environment file](.env.example) for more details.

## Deployment

See [docs/deploy.md](docs/deploy.md) if you would like to run your own instance of this plugin.

## Contribute

If you have suggestions for how Unassign could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

Note that all interactions fall under the [Probot Code of Conduct](https://github.com/probot/probot/blob/master/CODE_OF_CONDUCT.md).

## License

[ISC](LICENSE) Copyright © 2018-2019 Apurv Bajaj
