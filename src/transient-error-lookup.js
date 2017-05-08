class TransientErrorLookup {
  isTransientError(error) {
    // This list of transient errors comes from Microsoft implementation of SqlClient:
    //  - https://github.com/dotnet/corefx/blob/master/src/System.Data.SqlClient/src/System/Data/SqlClient/SqlInternalConnectionTds.cs#L115
    const transientErrors = [4060, 10928, 10929, 40197, 40501, 40613];

    for (let j = 0; j < transientErrors.length; j++) {
      if (transientErrors[j] === error) {
        return true;
      }
    }

    return false;
  }
}

module.exports.TransientErrorLookup = TransientErrorLookup;
