//
//  datatypes-js
//  Byte encoder and decoder for typical datatypes implemented in Javascript.
//  
//  Read readme.txt for instructions and LICENSE license.
//  
//  Copyright (c) 2009 Johan Dahlberg
//

var datatypes = {};
try{ datatypes = exports } catch(e) {}; // Try to export the lib for node.js
(function(self) {

// Name for special classes that datatypes-js recognise. An objects class can  be 
// determind by reading the _dtclass property.
var OPTION = 'option',
    DATATYPE = 'datatype',
    STRUCT = 'struct',
    POINTER = 'pointer';

// Special data sizes. 
var FLEX_DATASIZE = -2;
var DEFINED_DATASIZE = -1;

// Collections of datatypes and other constants.
var DATATYPES = {},
    CONSTANTS = {}

// Converts ´´arguments´´ into an array.
function get_array(args) {
    return Array.prototype.slice.call(args);
}

// Defines a new datatype with specified options.
//
//  datasize -  The size of the datatype. Valid values are positive integers 
//              or one of the following constants:
//             
//              FLEX_DATASIZE
//              The decoder decides when to stop read from buffer
//          
//              DEFINED_DATASIZE
//              The size is user defined. 
//
//  "choice" -  Optional. This indicates that the following two callbacks are 
//              encoder/decoder chooser's rather than a real encoder/decoder. A 
//              chooser callback is called takes one argument, the option set, 
//              and should return the encoder/decoder based on that.
//
//  encoder  -  The encoder to use for the datatype. The encoder is a callback
//              that takes one argument. The encoder should always return an 
//              array with bytes.
//
//              function(value) {
//                  var result = tobytes(value) // Encode value to bytes.
//                  return result;    
//              }
//
//  decoder  -  The decoder to use for the datatype. The decoder is a callback
//              that takes two arguments. The first argument is a Buffer Pointer.
//
//              The second argument is the byte buffer to read from.
//
//              The third argument is the size of the datatype. This argument
//              will always contain the fixed datasize, for datatypes with 
//              with specified size. The value will be undefined if the  
//              datasize is declared as DATASIZE_CUSTOM. The argument has a 
//              variable value if the datasize is declared as DATASIZE_DEFINE.
//
//              function(buffer, bp, length) {
//                  var result = 0;
//                  while(!bp.eof()) result += buffer(bp.next());
//                  return result;
//              }
//
function define() {
    var args = get_array(arguments);
    return {
        _dtclass: DATATYPE,
        size: args.shift(),
        choose_callback: args[0] == 'choice' ? args.shift() == 'choice' : false,
        encoder: args.shift(),
        decoder: args.shift()
    }
}

// Helper fucntion for the struct constructor. Returns a new constant field.
function const_field(dt, value, name, opts) {
    var encoder = dt.choose_callback ? dt.encoder(null, null, opts) : dt.encoder,
        decoder = dt.choose_callback ? dt.decoder(null, null, null, opts) : dt.decoder;
    var decode, bytes = [];

    encoder(bytes, value, opts);

    var encode = function(b, values) {
        b.push(bytes.join(''));
    }
    
    if(opts.no_error_check) {
        decode = function(buffer, pt) {
            pt.pos += bytes.length;
        }
    } else {
        decode = function(buffer, pt) {
            var result = decoder(buffer, pt, dt.size, opts);
            if(result != value) throw 'Decoding error: Struct[' + name + '] constant value does not match';
            return result;
        }
    }
    
    return {
        name: name,
        constant: true,
        encode: encode, 
        decode: decode,
        value: value
    }
}

// Helper fucntion for the struct constructor. Returns a new dynamic field.
var DYNAMIC = { _dtstruct: 'custom_field', callback: function(dt, args, opts) {
    var name = args.shift();
    var encoder = dt.choose_callback ? dt.encoder(null, null, opts) : dt.encoder,
        decoder = dt.choose_callback ? dt.decoder(null, null, null, opts) : dt.decoder;

    var decode = function(buffer, pt) {
        var result = decoder(buffer, pt, dt.size, opts);
        return result;
    }
    
    return {
        name: name,
        constant: false,
        encode: encoder, 
        decode: decode,
    }    
}};

// Adds the struct size (in bytes) to the buffer after encoding
var STRUCT_SIZE = { _dtstruct: 'custom_field', callback: function(dt, args, opts) {
    if(dt != DATATYPES['int16'] && dt != DATATYPES['int32'] && dt != DATATYPES['byte']) {
        throw 'STRUCT_SIZE only supports int16, int32 and byte.';
    }
    var encoder = dt.choose_callback ? dt.encoder(null, null, opts) : dt.encoder,
        decoder = dt.choose_callback ? dt.decoder(null, null, null, opts) : dt.decoder;

    // We are building a temporary buffer spot for this value, 
    var encode = function(b, value, opts) {
        encoder(b, 0, opts)
    }
    
    var decode = function(buffer, pt) {
        var result = decoder(buffer, pt, dt.size, opts);
        return result;
    }
    
    var after = function(buffer, pos) {
        // Calculate the total number of bytes in the generated buffer and 
        // encode it to bytes. Then replace the 
        var bytes = [];
        encoder(bytes, buffer.length, opts);
        var l = bytes.length;
        return buffer.substr(0, pos) + bytes.join('') + buffer.substr(pos + l);
    }
    
    return {
        name: 'size',
        constant: true,
        after_encoding: after,
        encode: encode, 
        decode: decode,
    }    
}};

// Defines a new data structure. A datastructure is a set of datatypes, with
// a compiled call sequence to encoders and decoders.
function struct() {
    var args = get_array(arguments);
    var first, second, options = {}, fields = [];
    while(args.length) {
        first = args.shift();
        switch(first._dtclass) {
            case OPTION:
                first.callback(options, 'struct');
                break;
            case DATATYPE:
            case STRUCT:
                second = args.shift();
                if(second._dtstruct == 'custom_field') {
                    fields.push(second.callback(first, args, options));
                } else {
                    fields.push(const_field(first, second, '_index' + fields.length, options));
                }
                break;
            default:
                throw "Unexpected value at " + fields.length;
        }
    }
    
    function datastruct() {
        var args = get_array(arguments);
        return args.length == 1 && args[0].constructor != Array ?
               datastruct.from_dict(args[0]) :
               datastruct.from_array(args);
    }
    
    datastruct.from_array = function(values) {
        var result = [], l = fields.length, after_callbacks = [];
        for(var i = 0; i < l; i++) {
            var field = fields[i];
            var value = field.constant ? null : values.shift();
            var current_size  = result.join('').length;
            field.encode(result, value);
            if(field.after_encoding) {
                after_callbacks.push({ field: field, pos: current_size});
            }
        }
        if(after_callbacks.length) {
            var old_result = result.join('');
            result = '';
            for(var i=0; i<after_callbacks.length; i++) {
                var o = after_callbacks[i];
                result = o.field.after_encoding(old_result, o.pos);
            }
            return result;
        } else {
            return result.join('');
        }
    }
    
    datastruct.from_dict = function(values) {
        var result = [], l = fields.length, after_callbacks = [];
        for(var i = 0; i < l; i++) {
            var field = fields[i];
            var value = values[field.name];
            var current_size  = result.join('').length;
            field.encode(result, value);
            if(field.after_encoding) {
                after_callbacks.push({ field: field, pos: current_size});
            }
        }
        if(after_callbacks.length) {
            var old_result = result.join('');
            result = '';
            for(var i=0; i<after_callbacks.length; i++) {
                var o = after_callbacks[i];
                result = o.field.after_encoding(old_result, o.pos);
            }
            return result;
        } else {
            return result.join('');
        }
    }
    
    datastruct.to_array = function(buffer, pt) {
        var pt = pt || new BufferPointer(0, buffer.length),
            result = [],l = fields.length;
        for(var i = 0; i < l; i++) {
            result.push(fields[i].decode(buffer, pt));
        }
        return result;
    }
    
    datastruct.to_dict = function(buffer, pt) {
        var pt = pt || new BufferPointer(0, buffer.length),
            result = {}, field, l = fields.length;
        for(var i = 0; i < l; i++) {
            field = fields[i];
            result[field.name] = field.decode(buffer, pt);
        }
        return result;
    }
    
    datastruct._fields = fields;
    
    return datastruct;
}

// Defines a new option. An option can give user-defined instructions while 
// encoding and decoding datatypes. The option function takes one callback 
// function.
//
// The callback function takes two arguments. The first argument is an option 
// set, used by current encoder/decoder. The second argument is a String that
// represents the current mode. There is three modes: ´´encode´´, ´´decode´´ and 
// ´´struct´´. THe option parser can choose to handle the request differently 
// based on which mode.
//
//      function(options, mode) { 
//          options.my_option = 1234 
//      }
//
// Each datatype encoder and decoder function get's the generated option set. 
//
// Built-in datatype's encoder's/decoder's ignores this option set. 
//
function option(callback) {
    return {
        _dtclass: OPTION,
        callback: callback
    }
}

// Define's the BIG_ENDIAN option. This option sets the buffer byte-order to 
// big-endian.
var BIG_ENDIAN = option( function(opts) { opts.little_endian = false } );

// Define's the LITTLE_ENDIAN option. This option sets the buffer byte-order to 
// little-endian.
var LITTLE_ENDIAN = option( function(opts) { opts.little_endian = true } );

// Define's the NO_ERROR_CHECK option. This options is only valid on STRUCTS. 
// This option will ignore to read all constant fields. The fields will not 
// be matched against the original value. This option makes reading faster but
// less accurate. 
var NO_ERROR_CHECK = option( 
    function(opts, mode) { 
        if(mode == 'struct') opts.no_error_check = true;
    } 
);

// Define's the DICT option. This option tell's the decoder to return a dict
// with the decoded values.
var DICT = option(
    function(opts, mode) { 
        if(mode == 'decode') opts.array_result = false;
    }
);

// Define's the ARRAY option. This option tell's the decoder to return an array
// with decoded values.
var ARRAY = option(
    function(opts, mode) { 
        if(mode == 'decode') opts.array_result = true;
    }
);

// Initializes a new BufferPoint instance.
function BufferPointer(pos, buffer_length) {
    this.pos = pos;
    this.length = buffer_length;
}

BufferPointer.prototype = {
    _dtclass: POINTER,
    eof: function() { return !(this.pos < this.length) },
    next: function() { return this.pos++ },
}

// Define built-in encoders. An encoder takes two arguments: value and 
// (optional) options. The value argument represents the Javascript object. The
// option argument is optional and contains a dict with user-defined options. 
// It's possible to create new option handles by calling the option 
// function.
//
// All built-in encoders can be accessd through the ENCODERS member in the
// exported module. 
var ENCODERS = {

    // Encodes bytes. If the v argument is a number, then the number is wrapped 
    // within an array. If not, the v argument is asumed to be an array with bytes.
    byte: function(b, v) {
        b.push(v);
    },
    
    // Encodes bytes. If the v argument is a number, then the number is wrapped 
    // within an array. If not, the v argument is asumed to be an array with bytes.
    bytes: function(b, v) {
        b.push(v);
    },
    
    // Returns an int16 encoder based on the bigendian option
    get_int16: function(b, v, opts) {
        return opts.little_endian ? ENCODERS.int16l : ENCODERS.int16;
    },

    // Encodes an Int16 into big-endian format.
    int16: function(b, v) {
        b.push(String.fromCharCode((v >> 8) & 0xff));
        b.push(String.fromCharCode(v & 0xff));
    },
    
    // Encodes an Int16 into little-endian format.
    int16l: function(b, v) {
        b.push(String.fromCharCode(v & 0xff));
        b.push(String.fromCharCode((v >> 8) & 0xff));
    },

    // Returns an int32 encoder based on the bigendian option
    get_int32: function(b, v, opts) {
        return opts.little_endian ? ENCODERS.int32l : ENCODERS.int32;
    },

    // Encodes an Int32 into big-endian format.
    int32: function(b, v) {
        b.push(String.fromCharCode((v >> 24) & 0xff));
        b.push(String.fromCharCode((v >> 16) & 0xff));
        b.push(String.fromCharCode((v >> 8) & 0xff));
        b.push(String.fromCharCode(v & 0xff));
    },

    // Encodes an Int32 into little-endian format.
    int32l: function (b, v) {
        b.push(String.fromCharCode(v & 0xff));
        b.push(String.fromCharCode((v >> 8) & 0xff));
        b.push(String.fromCharCode((v >> 16) & 0xff));
        b.push(String.fromCharCode((v >> 24) & 0xff));
    },
    
    // Encodes an 8-bit char-string.
    string8: function(b, v) {
        b.push(v);
    },
    
    // Encodes an 8-bit char null-terminated string.
    cstring: function(b, v) {
        b.push(v);
        b.push(String.fromCharCode(0));
    }
    
}

//  Define built-in decoders. A decoder is a callback for specified dataype. The 
//  callback takes three arguments: buffer, pointer and length. 
//  
//      buffer  - The buffer is an Array with 1 or more bytes.
//      pointer - A BufferPointer instance. The instance points to the buffer 
//                position to read from. 
//      length  - The total length of the datatype. This argument SHOULD be 
//                ignored by Datatypes with a fixed size.
//      options - OPTIONAL. A dict with user-defined options. 
//
// All built-in decoders can be accessd through the ENCODERS member in the
// exported module.
var DECODERS = {

    // Decodes an byte array.
    byte: function(buffer, pointer, length) {
        return buffer[pointer.pos++];
    },
    
    // Decodes an byte array.
    bytes: function(buffer, pointer, length) {
        if(length == 1) return buffer[pointer.pos++];
        var pos = pointer.pos;
        pointer.pos += length;
        return buffer.substr(pos, length);
    },
    
    // Returns an int16 decoder based on the bigendian option
    get_int16: function(b, pt, l, opts) {
        return opts.little_endian ? DECODERS.int16l : DECODERS.int16;
    },
    
    // Decodes an Int16 in big-endian format.
    int16: function(b, pt) {
        return (b.charCodeAt(pt.pos++) << 8) | (b.charCodeAt(pt.pos++));
    },
    
    // Decodes an Int16 in little-endian format.
    int16l: function(b, pt) {
        return (b.charCodeAt(pt.pos++)) | (b.charCodeAt(pt.pos++) << 8);
    },

    // Returns an int32 decoder based on the bigendian option
    get_int32: function(b, pt, l, opts) {
        return opts.little_endian ? DECODERS.int32l : DECODERS.int32;
    },

    // Decodes an Int32 in big-endian format.
    int32: function(b, pt) {
        return (b.charCodeAt(pt.pos++) << 24) |  (b.charCodeAt(pt.pos++) << 16) | (b.charCodeAt(pt.pos++) << 8) | (b.charCodeAt(pt.pos++));
    },

    // Decodes an Int32 in little-endian format.
    int32l: function(b, pt) {
        return (b.charCodeAt(pt.pos++)) | (b.charCodeAt(pt.pos++) << 8) |  (b.charCodeAt(pt.pos++) << 16) | (b.charCodeAt(pt.pos++) << 24);
    },
    
    // Decodes an 8-bit char-string.
    string8: function(b, pt, l) {
        var result = b.substr(pt.pos, l);
        pt.pos += l;
        return result;
    },
    
    // Decodes an 8-bit char null-terminated string.
    cstring: function(b, pt) {
        var bl = b.length, start = pt.pos;
        while(pt.pos < bl && b.charCodeAt(pt.pos++) != 0) {
        }
        return b.substr(start, pt.pos - start - 1);
    }
}

// Encodes Javascript objects into a byte-array.
function encode() {
    var args = get_array(arguments), result = [], options = { };
    while(args.length > 0) {
        var first = args.shift(), second, encoder;
        switch(first._dtclass) {
            case OPTION:
                first.callback(options, 'encode');
                break;
            case DATATYPE:
                second = args.shift();
                encoder = first.choose_callback ? 
                          first.encoder(null, second, options) :
                          first.encoder;
                encoder(result, second, options);
                break;
            case STRUCT:
                first(result, second.shift());
                break;
            default:
                throw "Expected datatype, struct or option: " + first._dtclass;
                break;
        }
    }
    return result.join('');
}

// Decodes a set of bytes into a javascript object.
function decode_dt(dt, buffer, pt, length, opts) {
    var decoder = dt.choose_callback ? 
                  dt.decoder(buffer, pt, length, opts) :
                  dt.decoder;
    return decoder(buffer, pt, length, opts);
}

// Decodes an byte-array into Javascript objects.
function decode() {
    var args = get_array(arguments), result = {}, options = {};
    var buffer = args.shift(), pt = new BufferPointer(0, buffer.length);
    while(args.length > 0) {
        var first = args.shift(), second, field, decoder, dtresult;
        switch(first._dtclass) {
            case POINTER:
                pt = first;
                continue;
            case OPTION:
                var array_result = options.array_result;
                first.callback(options, 'decode');
                if(options.array_result != array_result) {
                    result = options.array_result ? [] : {};
                }
                continue;
            case STRUCT:
                dtresult = options.array_result ? 
                                first.to_array(buffer, pt) :
                                first.to_dict(buffer, pt);
                break;
            case DATATYPE:
            default:
                if(args[0] !== undefined && args[0].size == DEFINED_DATASIZE) {
                    // Expect a number representing the size
                    // of the datatype
                    if(first._dtclass == DATATYPE) {
                        // Parse size from member
                        first = decode_dt(first, buffer, pt, length, options);
                    } 
                    second = args.shift();
                    dtresult = decode_dt(second, buffer, pt, first, options);
                } else {
                    dtresult = decode_dt(first, buffer, pt, first.size, options);
                }
                break;
        }
        if(options.array_result) {
            result.push(dtresult);
        } else {
            field = args.shift();
            if(field.constructor !== String) throw "Expected named field";
            result[field] = dtresult;
        }
    }
    return result;
}

// Predefined datatype definitions 
var defs = [
    ['byte'     , 1],
    ['bytes'    , DEFINED_DATASIZE],
    ['int16'    , 2, 'choice'],
    ['int32'    , 4, 'choice'],
    ['string8'  , DEFINED_DATASIZE],
    ['cstring'  , FLEX_DATASIZE]
];

// Contants and members that should be exported to the public.
var constants = [
    ['FLEX_DATASIZE', FLEX_DATASIZE], ['DEFINED_DATASIZE', DEFINED_DATASIZE], 
    ['DATATYPES', DATATYPES], ['CONSTANTS', CONSTANTS], 
    ['BIG_ENDIAN', BIG_ENDIAN], ['LITTLE_ENDIAN', LITTLE_ENDIAN], 
    ['ARRAY', ARRAY], ['DICT', DICT], ['ENCODERS', ENCODERS], 
    ['DECODERS', DECODERS], ['dynamic', DYNAMIC], ['struct_size', STRUCT_SIZE],
    ['NO_ERROR_CHECK', NO_ERROR_CHECK]
];

// Export constants and objects to the public scope. 
(function() {
    var dtindex = defs.length, cindex = constants.length;
    while(dtindex-- > 0) {
        var type = defs[dtindex];
        var name = type[0];
        var uname = name;
        var size = type[1];
        var prefix = '';
        var ctor_args = [size];
        if(type[2] == 'choice') {
            prefix = 'get_';
            ctor_args.push('choice');  
        } 
        ctor_args.push(ENCODERS[prefix + name]);
        ctor_args.push(DECODERS[prefix + name]);
        DATATYPES[uname] = self[uname] = define.apply(null, ctor_args);
    }
    while(cindex-- > 0) {
        var name = constants[cindex][0];
        var val = constants[cindex][1];
        CONSTANTS[name] = self[name] = val;
    }    
})();

// Exports all constants such as datatypes and options to the provided scope.
(function(to) {
    for(var name in DATATYPES) to[name] = DATATYPES[name]; 
    for(var name in CONSTANTS) to[name] = CONSTANTS[name];
})(self);

// Export functions
self.define = define;
self.option = option;
self.encode = encode;
self.decode = decode;
self.struct = struct;
self.BufferPointer = BufferPointer;
self.DATATYPES = DATATYPES;
self.CONSTANTS = CONSTANTS;


})(datatypes);
