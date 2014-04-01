class ConnectionError extends Error
  constructor: (message, code) ->
    unless @ instanceof ConnectionError
      if message instanceof ConnectionError
        return message
      
      err = new ConnectionError message, code
      Error.captureStackTrace err, arguments.callee
      return err
      
    @name = @constructor.name
    @message = message
    @code = code
		
    super()
    Error.captureStackTrace @, @constructor
    
class RequestError extends Error
  constructor: (message, code) ->
    unless @ instanceof RequestError
      if message instanceof RequestError
        return message
      
      err = new RequestError message, code
      Error.captureStackTrace err, arguments.callee
      return err
      
    @name = @constructor.name
    @message = message
    @code = code
		
    super()
    Error.captureStackTrace @, @constructor

module.exports =
  ConnectionError: ConnectionError
  RequestError: RequestError