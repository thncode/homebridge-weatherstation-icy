var Service, Characteristic, HomebridgeAPI, UUIDGen, FakeGatoHistoryService;
var inherits = require('util').inherits;
var os = require("os");
var hostname = os.hostname();
const fs = require('fs');
const moment = require('moment');

const readFile = "/root/.homebridge/weatherstation.txt";

var temperature, battery, alertLevel, readtime, icy, wasIcy;
var lastActivation, lastReset, lastChange, timesOpened, timeOpen, timeClose;

module.exports = function (homebridge) {
	
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    UUIDGen = homebridge.hap.uuid;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory("homebridge-weatherstation-icy", "WeatherStationIcy", WeatherStationIcy);
};


function WeatherStationIcy(log, config) {

    var that = this;
    this.log = log;
    this.name = config.name;
    this.displayName = this.name;
    this.deviceId = config.deviceId;

    this.config = config;

	alertLevel = config['alertLevel'];
	
    this.setUpServices();
    
    this.readData();
    
   	fs.watch(readFile, (event, filename) => {
   		if (event === 'change') this.readData();
   	});
};


WeatherStationIcy.prototype.readData = function () {

	var data = fs.readFileSync(readFile, "utf-8");
	var lastSync = Date.parse(data.substring(0, 19));
	if (isNaN(lastSync)) return;
	if (readtime == lastSync) return;
	readtime = lastSync;

	temperature = parseFloat(data.substring(20));
	battery = parseFloat(data.substring(58));

    icy = temperature < alertLevel ? 1 : 0;
	
	if (icy != wasIcy) {
		
		wasIcy = icy;

		this.log("Icy data: ", temperature, icy, battery);
	
		this.fakeGatoHistoryService.addEntry({ time: moment().unix(), status: icy });
	
		this.iceAlertService.getCharacteristic(Characteristic.ContactSensorState).updateValue(icy, null);
	
		if (icy) {
			this.timesOpened = this.timesOpened + 1;
	        this.timeClose = this.timeClose + (moment().unix() - this.lastChange);
	        this.lastActivation = moment().unix() - this.fakeGatoHistoryService.getInitialTime();
		    this.iceAlertService.getCharacteristic(Characteristic.LastActivation).updateValue(this.lastActivation, null)
	        this.iceAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null)
		}
		else {
	      	this.timeOpen = this.timeOpen + (moment().unix() - this.lastChange);
		}
	
	    this.lastChange = moment().unix();
	    this.fakeGatoHistoryService.setExtraPersistedData([{ "lastActivation": this.lastActivation, "lastReset": this.lastReset, "lastChange": this.lastChange, 
	    													 "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose }]);
	}
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(null);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(null);
}; 


WeatherStationIcy.prototype.getFirmwareRevision = function (callback) {
    return callback(null, '1.0');
};

WeatherStationIcy.prototype.getBatteryLevel = function (callback) {
    return callback(null, (battery - 0.8) * 100);
};

WeatherStationIcy.prototype.getStatusActive = function (callback) {
    return callback(null, true);
};

WeatherStationIcy.prototype.getStatusLowBattery = function (callback) {
    return callback(null, battery >= 0.8 ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
};

WeatherStationIcy.prototype.getStatusIce = function (callback) {	
    return callback(null, icy);
};


WeatherStationIcy.prototype.getOpenDuration = function (callback) {
    this.iceAlertService.getCharacteristic(Characteristic.OpenDuration).updateValue(this.timeOpen, null);
    return callback(null, this.timeOpen);
};


WeatherStationIcy.prototype.getClosedDuration = function (callback) {
    this.iceAlertService.getCharacteristic(Characteristic.ClosedDuration).updateValue(this.timeClose, null);
    return callback(null, this.timeClose);
};


WeatherStationIcy.prototype.gettimesOpened = function (callback) {
    this.iceAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null);
    return callback(null, this.timesOpened);
};


WeatherStationIcy.prototype.getLastActivation = function (callback) {
    this.iceAlertService.getCharacteristic(Characteristic.LastActivation).updateValue(this.lastActivation, null);
    return callback(null, this.lastActivation);
};


WeatherStationIcy.prototype.getReset = function (callback) {
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback(null, this.lastReset);
};


WeatherStationIcy.prototype.setReset = function (value, callback) {
	this.timesOpened = 0;
	this.lastReset = value;
    this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
    			"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);

    if (this.iceAlertService.getCharacteristic(Characteristic.TimesOpened)) {
        this.iceAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null)
    }
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback();
};


WeatherStationIcy.prototype.setUpServices = function () {

    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "THN Systems")
        .setCharacteristic(Characteristic.Model, "WeatherStationIcy")
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name);
    this.informationService.getCharacteristic(Characteristic.FirmwareRevision)
        .on('get', this.getFirmwareRevision.bind(this));
        
    this.batteryService = new Service.BatteryService(this.name);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));
    this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));

    this.iceAlertService = new Service.ContactSensor("Eis", "ice");
    this.iceAlertService.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', this.getStatusIce.bind(this));
    this.iceAlertService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.iceAlertService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    Characteristic.OpenDuration = function() {
    	 Characteristic.call(this, 'Time open', 'E863F118-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
         });
         this.value = this.getDefaultValue();
    };
    Characteristic.OpenDuration.UUID = 'E863F118-079E-48FF-8F27-9C2605A29F52';  
    inherits(Characteristic.OpenDuration, Characteristic);

    Characteristic.ClosedDuration = function() {
    	 Characteristic.call(this, 'Time closed', 'E863F119-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
         });
         this.value = this.getDefaultValue();
    };
    Characteristic.ClosedDuration.UUID = 'E863F119-079E-48FF-8F27-9C2605A29F52';  
    inherits(Characteristic.ClosedDuration, Characteristic);
    
    Characteristic.LastActivation = function() {
    	 Characteristic.call(this, 'Last Activation', 'E863F11A-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
         });
         this.value = this.getDefaultValue();
    };
    Characteristic.LastActivation.UUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';  
    inherits(Characteristic.LastActivation, Characteristic);

    Characteristic.TimesOpened = function() {
    	 Characteristic.call(this, 'TimesOpened', 'E863F129-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    Characteristic.TimesOpened.UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';  
    inherits(Characteristic.TimesOpened, Characteristic);

    Characteristic.ResetTotal = function() {
    	 Characteristic.call(this, 'reset total', 'E863F112-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
         });
         this.value = this.getDefaultValue();
    };
    Characteristic.ResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';  
    inherits(Characteristic.ResetTotal, Characteristic);
    
    this.iceAlertService.addCharacteristic(Characteristic.LastActivation)
        .on('get', this.getLastActivation.bind(this));
    this.iceAlertService.addCharacteristic(Characteristic.TimesOpened)
        .on('get', this.gettimesOpened.bind(this));
    this.iceAlertService.addCharacteristic(Characteristic.OpenDuration)
        .on('get', this.getOpenDuration.bind(this));
    this.iceAlertService.addCharacteristic(Characteristic.ClosedDuration)
        .on('get', this.getClosedDuration.bind(this));
    this.iceAlertService.addCharacteristic(Characteristic.ResetTotal)
        .on('get', this.getReset.bind(this))
        .on('set', this.setReset.bind(this));

    this.fakeGatoHistoryService = new FakeGatoHistoryService("door", this, { storage: 'fs' });

    this.fakeGatoHistoryLoaded();
};


WeatherStationIcy.prototype.fakeGatoHistoryLoaded = function () {
    if (this.fakeGatoHistoryService.isHistoryLoaded() == false) {
		this.log("wait for history load");
 		setTimeout(this.fakeGatoHistoryLoaded.bind(this), 100);
    } else {
		this.log("history loaded");
		
	    this.extra = this.fakeGatoHistoryService.getExtraPersistedData();
	            
	    if (this.extra == undefined) {
	    	
	    	this.lastActivation = 0;
	    	this.lastReset = moment().unix() - moment('2001-01-01T00:00:00Z').unix();
	    	this.lastChange = moment().unix();
	    	this.timesOpened = 0;
	    	this.timeOpen = 0;
	    	this.timeClose = 0;
	           
	        this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
	        				"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);
	
	        } else {
	            this.lastActivation = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastActivation;
	            this.lastReset = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastReset;
	            this.lastChange = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastChange;
	            this.timesOpened = this.fakeGatoHistoryService.getExtraPersistedData()[0].timesOpened;
	            this.timeOpen = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeOpen;
	            this.timeClose = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeClose;
	        }        
    }
};


WeatherStationIcy.prototype.getServices = function () {
    var services = [this.informationService, this.batteryService, this.iceAlertService, this.fakeGatoHistoryService];

    return services;
};
