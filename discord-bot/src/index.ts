import CustomClient from "./base/classes/CustomClient";

// Глобальные страховки: не даём процессу молча упасть из-за необработанной ошибки.
process.on("unhandledRejection", (reason) => {
    console.error("Необработанный rejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("Необработанное исключение:", err);
});

new CustomClient().Init().catch((err) => {
    console.error("Не удалось запустить бота:", err);
    process.exit(1);
});
