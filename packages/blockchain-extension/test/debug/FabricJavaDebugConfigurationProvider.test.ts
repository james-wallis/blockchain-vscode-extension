/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import * as vscode from 'vscode';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { PackageRegistryEntry } from '../../extension/registries/PackageRegistryEntry';
import { FabricEnvironmentConnection } from 'ibm-blockchain-platform-environment-v1';
import { UserInputUtil } from '../../extension/commands/UserInputUtil';
import { FabricJavaDebugConfigurationProvider } from '../../extension/debug/FabricJavaDebugConfigurationProvider';
import { FabricSmartContractDefinition, FabricEnvironmentRegistryEntry, FabricRuntimeUtil, EnvironmentType, FabricEnvironmentRegistry } from 'ibm-blockchain-platform-common';
import { Reporter } from '../../extension/util/Reporter';
import { FabricEnvironmentManager } from '../../extension/fabric/environments/FabricEnvironmentManager';
import { GlobalState } from '../../extension/util/GlobalState';
import { ExtensionUtil } from '../../extension/util/ExtensionUtil';
import { TestUtil } from '../TestUtil';
import { EnvironmentFactory } from '../../extension/fabric/environments/EnvironmentFactory';
import { FabricDebugConfigurationProvider } from '../../extension/debug/FabricDebugConfigurationProvider';
import { LocalMicroEnvironmentManager } from '../../extension/fabric/environments/LocalMicroEnvironmentManager';
import { LocalMicroEnvironment } from '../../extension/fabric/environments/LocalMicroEnvironment';

const should: Chai.Should = chai.should();
chai.use(sinonChai);

// tslint:disable no-unused-expression
describe('FabricJavaDebugConfigurationProvider', () => {
    let mySandbox: sinon.SinonSandbox;

    describe('provideDebugConfigurations', () => {

        it('should provide a debug configuration', async () => {
            const provider: FabricJavaDebugConfigurationProvider = new FabricJavaDebugConfigurationProvider();
            const config: any = await provider.provideDebugConfigurations();
            config.should.deep.equal([{
                type: 'fabric:java',
                request: 'launch',
                name: 'Debug Smart Contract',
                mainClass: 'org.hyperledger.fabric.contract.ContractRouter'
            }]);
        });

    });

    before(async () => {
        mySandbox = sinon.createSandbox();
        await TestUtil.setupTests(mySandbox);
    });

    describe('resolveDebugConfiguration', () => {

        let fabricDebugConfig: FabricJavaDebugConfigurationProvider;
        let workspaceFolder: any;
        let debugConfig: any;
        let runtimeStub: sinon.SinonStubbedInstance<LocalMicroEnvironment>;
        let packageEntry: PackageRegistryEntry;
        let mockRuntimeConnection: sinon.SinonStubbedInstance<FabricEnvironmentConnection>;
        let startDebuggingStub: sinon.SinonStub;
        let sendTelemetryEventStub: sinon.SinonStub;
        let showInputBoxStub: sinon.SinonStub;
        let getExtensionLocalFabricSetting: sinon.SinonStub;
        let showQuickPickItemStub: sinon.SinonStub;
        let environmentRegistry: FabricEnvironmentRegistryEntry;
        let showQuickPickStub: sinon.SinonStub;

        beforeEach(async () => {
            mySandbox = sinon.createSandbox();
            await FabricEnvironmentRegistry.instance().clear();
            await TestUtil.setupLocalFabric();

            getExtensionLocalFabricSetting = mySandbox.stub(ExtensionUtil, 'getExtensionLocalFabricSetting');
            getExtensionLocalFabricSetting.returns(true);

            fabricDebugConfig = new FabricJavaDebugConfigurationProvider();

            runtimeStub = mySandbox.createStubInstance(LocalMicroEnvironment);
            runtimeStub.getPeerChaincodeURL.resolves('grpc://127.0.0.1:54321');
            runtimeStub.isRunning.resolves(true);
            runtimeStub.numberOfOrgs = 1;
            runtimeStub.getAllOrganizationNames.resolves(['Org1MSP', 'Org2MSP']);
            runtimeStub.getName.returns(FabricRuntimeUtil.LOCAL_FABRIC);

            mySandbox.stub(LocalMicroEnvironmentManager.instance(), 'getRuntime').returns(runtimeStub);

            environmentRegistry = new FabricEnvironmentRegistryEntry();
            environmentRegistry.name = FabricRuntimeUtil.LOCAL_FABRIC;
            environmentRegistry.managedRuntime = true;
            environmentRegistry.environmentType = EnvironmentType.LOCAL_MICROFAB_ENVIRONMENT;
            environmentRegistry.numberOfOrgs = 1;

            mySandbox.stub(FabricEnvironmentManager.instance(), 'getEnvironmentRegistryEntry').returns(environmentRegistry);

            workspaceFolder = {
                name: 'myFolder',
                uri: vscode.Uri.file('myPath')
            };

            mySandbox.stub(fs, 'readJSON');
            mySandbox.stub(fs, 'readFile').resolves(`{
                "name": "mySmartContract",
                "version": "0.0.1"
            }`);

            debugConfig = {
                type: 'fabric:java',
                name: 'Launch Program'
            };

            debugConfig.request = 'myLaunch';
            debugConfig.cwd = 'myCwd';
            debugConfig.args = ['--peer.address', 'localhost:12345'];

            mySandbox.stub(vscode.workspace, 'findFiles').resolves([]);

            packageEntry = new PackageRegistryEntry();
            packageEntry.name = 'banana';
            packageEntry.version = 'vscode-13232112018';
            packageEntry.path = path.join('myPath');

            mockRuntimeConnection = mySandbox.createStubInstance(FabricEnvironmentConnection);
            mockRuntimeConnection.connect.resolves();
            mockRuntimeConnection.getAllPeerNames.resolves('peerOne');

            const instantiatedChaincodes: FabricSmartContractDefinition[] = [{ name: 'myOtherContract', version: 'vscode-debug-13232112018', sequence: 1 }, { name: 'cake-network', version: 'vscode-debug-174758735087', sequence: 1 }];
            mockRuntimeConnection.getAllCommittedSmartContractDefinitions.resolves(instantiatedChaincodes);

            mySandbox.stub(FabricEnvironmentManager.instance(), 'getConnection').returns(mockRuntimeConnection);

            startDebuggingStub = mySandbox.stub(vscode.debug, 'startDebugging');

            showInputBoxStub = mySandbox.stub(UserInputUtil, 'showInputBox').withArgs('Enter a name for your Java package').resolves('mySmartContract');
            showInputBoxStub.withArgs('Enter a version for your Java package').resolves('0.0.1');

            sendTelemetryEventStub = mySandbox.stub(Reporter.instance(), 'sendTelemetryEvent');

            mySandbox.stub(GlobalState, 'get').returns({
                generatorVersion: '0.0.36'
            });

            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub = mySandbox.stub(UserInputUtil, 'showQuickPickItem').resolves({label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment});
            mySandbox.stub(LocalMicroEnvironmentManager.instance(), 'ensureRuntime').resolves(runtimeStub);

            mySandbox.stub(FabricDebugConfigurationProvider, 'connectToGateway').resolves(true);

            showQuickPickStub = mySandbox.stub(UserInputUtil, 'showQuickPick');

            FabricDebugConfigurationProvider.environmentName = FabricRuntimeUtil.LOCAL_FABRIC;

        });

        afterEach(() => {
            mySandbox.restore();
        });

        it('should create a debug configuration', async () => {

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);

            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                type: 'java',
                request: 'myLaunch',
                cwd: 'myCwd',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                args: ['--peer.address', 'localhost:12345']
            });
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
        });

        it('should add cwd if not set', async () => {

            debugConfig.cwd = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                type: 'java',
                request: 'myLaunch',
                cwd: path.sep + 'myPath',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                args: ['--peer.address', 'localhost:12345']
            });
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
        });

        it('should add args if not defined', async () => {
            debugConfig.args = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                type: 'java',
                request: 'myLaunch',
                cwd: 'myCwd',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                args: ['--peer.address', '127.0.0.1:54321']
            });
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
        });

        it('should add more args if some args exist', async () => {
            debugConfig.args = ['--myArgs', 'myValue'];

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                type: 'java',
                request: 'myLaunch',
                cwd: 'myCwd',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                args: ['--myArgs', 'myValue', '--peer.address', '127.0.0.1:54321']
            });
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
        });

        it('should return if peer address is undefined', async () => {
            debugConfig.args = ['--myArgs', 'myValue'];
            runtimeStub.numberOfOrgs = 2;
            showQuickPickStub.resolves();
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.not.have.been.called;
            runtimeStub.getAllOrganizationNames.should.have.been.calledOnceWithExactly(false);
            showQuickPickStub.should.have.been.calledOnceWithExactly('Select the organization to debug for', ['Org1MSP', 'Org2MSP']);
            sendTelemetryEventStub.should.not.have.been.called;
            should.not.exist(FabricDebugConfigurationProvider.orgName);
        });

        it('should set correct org if there are multiple', async () => {
            debugConfig.args = [];
            runtimeStub.numberOfOrgs = 2;
            showQuickPickStub.resolves('Org2MSP');
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                args: ['--peer.address', '127.0.0.1:54321'],
                cwd: 'myCwd',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                request: 'myLaunch',
                type: 'java'
            });
            runtimeStub.getAllOrganizationNames.should.have.been.calledOnceWithExactly(false);
            showQuickPickStub.should.have.been.calledOnceWithExactly('Select the organization to debug for', ['Org1MSP', 'Org2MSP']);
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
            FabricDebugConfigurationProvider.orgName.should.equal('Org2');
        });

        it('should add in request if not defined', async () => {
            debugConfig.request = null;

            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.equal(config, undefined);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            startDebuggingStub.should.have.been.calledOnceWithExactly(sinon.match.any, {
                type: 'java',
                request: 'launch',
                cwd: 'myCwd',
                debugEvent: FabricJavaDebugConfigurationProvider.debugEvent,
                env: {
                    CORE_CHAINCODE_ID_NAME: `mySmartContract:0.0.1`
                },
                args: ['--peer.address', 'localhost:12345']
            });
            sendTelemetryEventStub.should.have.been.calledWith('Smart Contract Debugged', { language: 'Java' });
        });

        it('should return if name not set', async () => {
            showInputBoxStub.withArgs('Enter a name for your Java package').resolves();
            const config: vscode.DebugConfiguration = await fabricDebugConfig.resolveDebugConfiguration(workspaceFolder, debugConfig);
            should.not.exist(config);
            const localEnvironment: LocalMicroEnvironment = EnvironmentFactory.getEnvironment(environmentRegistry) as LocalMicroEnvironment;
            showQuickPickItemStub.should.have.been.calledOnceWithExactly('Select a local environment to debug', [{label: FabricRuntimeUtil.LOCAL_FABRIC, data: localEnvironment}]);
            sendTelemetryEventStub.should.not.have.been.called;
        });
    });
});
