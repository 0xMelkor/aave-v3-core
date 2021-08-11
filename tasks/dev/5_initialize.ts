import { task } from 'hardhat/config';
import {
  deployPoolCollateralManager,
  deployMockFlashLoanReceiver,
  deployAaveProtocolDataProvider,
} from '../../helpers/contracts-deployments';
import { eNetwork } from '../../helpers/types';

import { tEthereumAddress, eContractid } from '../../helpers/types';
import { waitForTx, filterMapBy } from '../../helpers/misc-utils';
import { configureReservesByHelper, initReservesByHelper } from '../../helpers/init-helpers';
import { getAllTokenAddresses } from '../../helpers/mock-helpers';
import { ZERO_ADDRESS } from '../../helpers/constants';
import { getAllMockedTokens, getPoolAddressesProvider } from '../../helpers/contracts-getters';
import { insertContractAddressInDb } from '../../helpers/contracts-helpers';
import AaveConfig from '../../market-config';

task('dev:initialize-pool', 'Initialize pool configuration.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .setAction(async ({ verify }, localBRE) => {
    await localBRE.run('set-DRE');
    const network = <eNetwork>localBRE.network.name;
    const poolConfig = AaveConfig;
    const {
      ATokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
    } = poolConfig;
    const mockTokens = await getAllMockedTokens();
    const allTokenAddresses = getAllTokenAddresses(mockTokens);

    const addressesProvider = await getPoolAddressesProvider();

    const protoPoolReservesAddresses = <{ [symbol: string]: tEthereumAddress }>(
      filterMapBy(allTokenAddresses, (key: string) => !key.includes('UNI_'))
    );

    const testHelpers = await deployAaveProtocolDataProvider(addressesProvider.address, verify);

    const reservesParams = poolConfig.ReservesConfig;

    const admin = await addressesProvider.getPoolAdmin();

    const treasuryAddress = poolConfig.ReserveFactorTreasuryAddress;

    await initReservesByHelper(
      reservesParams,
      protoPoolReservesAddresses,
      ATokenNamePrefix,
      StableDebtTokenNamePrefix,
      VariableDebtTokenNamePrefix,
      SymbolPrefix,
      admin,
      treasuryAddress,
      ZERO_ADDRESS,
      verify
    );
    await configureReservesByHelper(reservesParams, protoPoolReservesAddresses, testHelpers, admin);

    const collateralManager = await deployPoolCollateralManager(verify);
    await waitForTx(await addressesProvider.setPoolCollateralManager(collateralManager.address));

    const mockFlashLoanReceiver = await deployMockFlashLoanReceiver(
      addressesProvider.address,
      verify
    );
    await insertContractAddressInDb(
      eContractid.MockFlashLoanReceiver,
      mockFlashLoanReceiver.address
    );

    await insertContractAddressInDb(eContractid.AaveProtocolDataProvider, testHelpers.address);
  });
