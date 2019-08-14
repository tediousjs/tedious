require('@babel/register')({
  extensions: ['.js', '.ts'],
  plugins: [ 'istanbul' ]
});

global.describe = function() {};
