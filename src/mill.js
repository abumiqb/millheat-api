import { command, authenticate } from './api';

const REFRESH_OFFSET = 5 * 60 * 1000;

const ACCOUNT_ENDPOINT = 'https://eurouter.ablecloud.cn:9005/zc-account/v1/';
const SERVICE_ENDPOINT = 'https://eurouter.ablecloud.cn:9005/millService/v1/';

class Mill {
  constructor(username, password, opts = {}) {
    this.logger = opts.logger || console;
    this.accountEndpoint = opts.accountEndpoint || ACCOUNT_ENDPOINT;
    this.serviceEndpoint = opts.serviceEndpoint || SERVICE_ENDPOINT;
    this.username = username;
    this.password = password;
    this.authenticating = false;
    this.devices = [];
    this._authenticate();
  }

  async _authenticate() {
    if (!this.authenticating) {
      this.authenticating = true;
      try {
        const auth = await authenticate(this.username, this.password, this.logger, this.accountEndpoint);
        this.token = auth.token;
        this.userId = auth.userId;
        this.tokenExpire = auth.tokenExpire;
        this.authenticating = false;
      } catch (e) {
        this.token = null;
        this.userId = null;
        this.tokenExpire = null;
        this.authenticating = false;
        throw e;
      }
    } else {
      while (this.authenticating) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!this.token) {
        throw new Error('Authentication failed');
      }
    }
  }

  async _command(commandName, payload) {
    while (this.authenticating) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    try {
      if (!this.token || new Date(this.tokenExpire).getTime() < new Date().getTime() - REFRESH_OFFSET) {
        this.logger.debug('Refreshing token');
        await this._authenticate();
      }
      return await command(this.userId, this.token, commandName, payload, this.logger, this.serviceEndpoint);
    } catch (e) {
      this.logger.error("Couldn't perform command:" + e.message);
      throw e;
    }
  }

  async _getLocalDevice(deviceId) {
    let device = this.devices.find(item => item.deviceId === deviceId);
    if (!device) {
      device = await this.getDevice(deviceId);
    }
    return device;
  }

  async getHomes() {
    return await this._command('selectHomeList', {});
  }

  async getRooms(homeId) {
    return await this._command('selectRoombyHome', { homeId });
  }

  async getIndependentDevices(homeId) {
    return await this._command('getIndependentDevices', { homeId });
  }

  async getDevicesByRoom(roomId) {
    return await this._command('selectDevicebyRoom', { roomId });
  }

  async getDevice(deviceId) {
    const device = await this._command('selectDevice', { deviceId });
    if (!this.devices.find(item => item.deviceId === device.deviceId)) {
      this.devices.push(device);
    } else {
      this.devices.map(item => (item.deviceId === device.deviceId ? device : item));
    }
    return device;
  }

  async setTemperature(deviceId, temperature) {
    return await this._command('changeDeviceInfo', {
      homeType: 0,
      deviceId,
      value: temperature,
      timeZoneNum: '+02:00',
      key: 'holidayTemp',
    });
  }

  async setIndependentControl(deviceId, temperature, enable) {
    const device = await this._getLocalDevice(deviceId);
    return await this._command('deviceControl', {
      status: enable ? 1 : 0,
      deviceId: device.deviceId,
      operation: 1,
      holdTemp: temperature,
      subDomain: device.subDomain,
      holdMins: 0,
      holdHours: 0,
    });
  }

  async setPower(deviceId, on) {
    const device = await this._getLocalDevice(deviceId);
    return await this._command('deviceControl', {
      subDomain: device.subDomain,
      deviceId: device.deviceId,
      testStatus: 1,
      operation: 0,
      status: on ? 1 : 0,
      windStatus: device.fanStatus,
      tempType: 0,
      powerLevel: 0,
    });
  }
}

export default Mill;
