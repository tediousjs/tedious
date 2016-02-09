'use strict';

const EventEmitter = require('events').EventEmitter;
const TYPES = require('./data-type').typeByName;
const RequestError = require('./errors').RequestError;

module.exports = class Request extends EventEmitter {
  constructor(sqlTextOrProcedure, callback) {
    super();

    this.sqlTextOrProcedure = sqlTextOrProcedure;
    this.callback = callback;
    this.parameters = [];
    this.parametersByName = {};
    this.userCallback = this.callback;
    this.callback = function() {
      if (this.preparing) {
        this.emit('prepared');
        return this.preparing = false;
      } else {
        this.userCallback.apply(this, arguments);
        return this.emit('requestCompleted');
      }
    };
  }

  addParameter(name, type, value, options) {
    if (options == null) {
      options = {};
    }

    const parameter = {
      type: type,
      name: name,
      value: value,
      output: options.output || (options.output = false),
      length: options.length,
      precision: options.precision,
      scale: options.scale
    };
    this.parameters.push(parameter);
    return this.parametersByName[name] = parameter;
  }

  addOutputParameter(name, type, value, options) {
    if (options == null) {
      options = {};
    }
    options.output = true;
    return this.addParameter(name, type, value, options);
  }

  makeParamsParameter(parameters) {
    let paramsParameter = '';
    for (let i = 0, len = parameters.length; i < len; i++) {
      const parameter = parameters[i];
      if (paramsParameter.length > 0) {
        paramsParameter += ', ';
      }
      paramsParameter += '@' + parameter.name + ' ';
      paramsParameter += parameter.type.declaration(parameter);
      if (parameter.output) {
        paramsParameter += ' OUTPUT';
      }
    }
    return paramsParameter;
  }

  transformIntoExecuteSqlRpc() {
    if (this.validateParameters()) {
      return;
    }

    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addParameter('statement', TYPES.NVarChar, this.sqlTextOrProcedure);
    if (this.originalParameters.length) {
      this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    }

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      this.parameters.push(parameter);
    }
    return this.sqlTextOrProcedure = 'sp_executesql';
  }

  transformIntoPrepareRpc() {
    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addOutputParameter('handle', TYPES.Int);
    this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    this.addParameter('stmt', TYPES.NVarChar, this.sqlTextOrProcedure);
    this.sqlTextOrProcedure = 'sp_prepare';
    this.preparing = true;
    return this.on('returnValue', (name, value) => {
      if (name === 'handle') {
        return this.handle = value;
      } else {
        return this.error = RequestError('Tedious > Unexpected output parameter ' + name + ' from sp_prepare');
      }
    });
  }

  transformIntoUnprepareRpc() {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);
    return this.sqlTextOrProcedure = 'sp_unprepare';
  }

  transformIntoExecuteRpc(parameters) {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      parameter.value = parameters[parameter.name];
      this.parameters.push(parameter);
    }

    if (this.validateParameters()) {
      return;
    }

    return this.sqlTextOrProcedure = 'sp_execute';
  }

  validateParameters() {
    for (let i = 0, len = this.parameters.length; i < len; i++) {
      const parameter = this.parameters[i];
      const value = parameter.type.validate(parameter.value);
      if (value instanceof TypeError) {
        return this.error = new RequestError('Validation failed for parameter \'' + parameter.name + '\'. ' + value.message, 'EPARAM');
      }
      parameter.value = value;
    }
    return null;
  }
};
