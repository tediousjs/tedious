**Driver version** : 

**SQL Server version** :<!-- Also, mention if it is an Azure DB -->

**Problem description** : <!-- Expected behaviour, actual behaviour, error stack, and any other useful details-->

**Steps/code to reproduce the issue** :

**Logs**: <!--Attach driver logs if possible. To generate logs, enable debug option in connection config as below,
`
config  = {
	...
	options: {
		debug: {
		packet:  true,
		data:  true,
		payload:  true,
		token:  true,
		log:  true
		}
	}
}
`
PS: Make sure to remove any sensitive information from the logs before posting-->