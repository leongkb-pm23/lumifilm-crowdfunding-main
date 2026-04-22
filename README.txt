1. Open connect ganache with metamask and open remix ide 
2. Deploy LumiToken.sol and set the compiler to 0.8.20+ and change ERM version to paris and then
recompile.
3. Repeat step 2 with LumiCrowdfunding.sol

4. Environment choose Dev and Ganache Provider
5. Create a new file in VSD and name it .env; open .env.example and copy all the code and paste
into .env
6. Deploy contract LumiToken.sol and then copy the contract address and paste it into .env VITE_LUMI_TOKEN_ADDRESS
7. Repeat step 6 with LumiCrowdfunding.
8. Copy the contract address of LumiCrowdfunding and expand the LumiToken contract and then select
the function setMinter and paste the address into the input field
9. Click Transact 
10. Run npm install in terminal
11. Run npm run dev
12. Copy address link and paste into the browser.


