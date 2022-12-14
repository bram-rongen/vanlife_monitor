import UltimatronBMS from "./lib/UltimatronBMS";
import connectMqtt from "./lib/mqtt";
import settings from "./settings";

export default async () => {
  const bms = new UltimatronBMS(settings.ultimatron);
  const client = await connectMqtt(
    settings.mqtt.socket,
    settings.mqtt.mqtt,
    settings.mqtt.topic.prefix
  );

  bms.startScanning();
  bms.startReadingBatteryState(5000);
  bms.startReadingCellState(60000);

  bms.messageEmitter.on("batteryState", (state) =>
    client.publish(
      `${settings.mqtt.topic.prefix}/ultimatron/batterystate`,
      JSON.stringify({
        ...state,
        power: state.voltage * state.current,
        charged_percentage: Math.round((state.charge / state.full) * 100),
      })
    )
  );

  bms.messageEmitter.on("cellState", (state) =>
    client.publish(
      `${settings.mqtt.topic.prefix}/ultimatron/cellstate`,
      JSON.stringify(state)
    )
  );
};
