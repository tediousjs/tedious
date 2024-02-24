export function debugOptionsFromEnv() {
  const options = {
    packet: false,
    data: false,
    payload: false,
    token: false,
  };

  if (!process.env.TEDIOUS_DEBUG) {
    return options;
  }

  for (const type of process.env.TEDIOUS_DEBUG.split(',')) {
    switch (type) {
      case 'packet':
      case 'data':
      case 'payload':
      case 'token':
        options[type] = true;
    }
  }

  return options;
}
